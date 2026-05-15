"""Cloudflare R2 object storage (S3-compatible).

Files are stored as bytes under keys like `u/{user_id}/{file_id}`.
Content is opaque to this layer — callers serialize as needed.
"""

import asyncio
import os
from functools import lru_cache

import boto3
from botocore.client import Config

R2_BUCKET = os.getenv("R2_BUCKET", "task-agents-files")


@lru_cache(maxsize=1)
def _client():
    account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def object_key(user_id: str, file_id: str) -> str:
    return f"u/{user_id}/{file_id}"


# boto3 is sync; run in a thread to avoid blocking the event loop.


async def put(key: str, body: bytes, content_type: str = "application/octet-stream"):
    await asyncio.to_thread(
        _client().put_object,
        Bucket=R2_BUCKET,
        Key=key,
        Body=body,
        ContentType=content_type,
    )


async def get(key: str) -> bytes:
    def _do():
        return _client().get_object(Bucket=R2_BUCKET, Key=key)["Body"].read()

    return await asyncio.to_thread(_do)


async def delete(key: str):
    await asyncio.to_thread(_client().delete_object, Bucket=R2_BUCKET, Key=key)


async def delete_many(keys: list[str]):
    """Delete up to 1000 keys per call (S3 limit). No-op on empty list."""
    if not keys:
        return

    def _do(batch):
        _client().delete_objects(
            Bucket=R2_BUCKET,
            Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True},
        )

    for i in range(0, len(keys), 1000):
        await asyncio.to_thread(_do, keys[i : i + 1000])
