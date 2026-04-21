FROM google/cloud-sdk:slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      jq \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sleep", "infinity"]
