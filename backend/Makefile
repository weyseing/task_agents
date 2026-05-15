.PHONY: install test clean

VENV := .venv
PIP  := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest

# `make install` — create venv + install dev deps (idempotent)
install: $(VENV)/.installed

$(VENV)/.installed: requirements-dev.txt
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements-dev.txt
	touch $@

# `make test`                       — run everything in tests/
# `make test FILE=tests/foo.py`     — run one file
# `make test K=expired`             — filter by test NAME (-k)
# `make test M=unit`                — filter by MARKER (-m)
# `make test M="integration and security"` — boolean marker filter
# Flags combine: `make test FILE=tests/test_sso_attacks.py M=unit K=verify`
test: install
	$(PYTEST) $(if $(FILE),$(FILE),tests/) -v \
		$(if $(K),-k "$(K)") \
		$(if $(M),-m "$(M)")

clean:
	rm -rf $(VENV) .pytest_cache **/__pycache__
