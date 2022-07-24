MAKEFLAGS += --warn-undefined-variables
SHELL := bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := all
.SUFFIXES:

GIT_COMMIT ?= $(shell git rev-parse HEAD)
DOCKER_REPO  := 174522763890.dkr.ecr.us-east-1.amazonaws.com
DOCKER_IMAGE := $(DOCKER_REPO)forter-blob-store-nodejs:$(GIT_COMMIT)

.PHONY: build
build:
	docker build --pull --tag $(DOCKER_IMAGE) .

.PHONY: ci-test
ci-test:

.PHONY: dist
dist:
	echo "Handled by CI"
