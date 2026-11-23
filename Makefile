.PHONY: build build-api build-cwmp build-usp build-worker test tidy frontend-install frontend-build docker-build docker-up docker-down docker-logs

BIN_DIR=bin

build: build-api build-cwmp build-usp build-worker

build-api:
	@mkdir -p $(BIN_DIR)
	go build -o $(BIN_DIR)/nexaacs-api ./cmd/api

build-cwmp:
	@mkdir -p $(BIN_DIR)
	go build -o $(BIN_DIR)/nexaacs-cwmp ./cmd/cwmp

build-usp:
	@mkdir -p $(BIN_DIR)
	go build -o $(BIN_DIR)/nexaacs-usp ./cmd/usp

build-worker:
	@mkdir -p $(BIN_DIR)
	go build -o $(BIN_DIR)/nexaacs-worker ./cmd/worker

test:
	go test ./...

tidy:
	go mod tidy

frontend-install:
	cd nexaacs-web && npm ci

frontend-build:
	cd nexaacs-web && npm run build

docker-build:
	docker compose build

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f --tail=100
