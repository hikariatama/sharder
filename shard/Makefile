SRC = src/shard.cpp
BUILD_DIR = bin
DATA_DIR = .data
BIN_NAME = shard
CXXFLAGS = -O2 -std=c++17
LDFLAGS = -lcurl
UNAME_S := $(shell uname -s)
IS_MACOS := $(findstring Darwin, $(UNAME_S))
DOCKER_IMAGE = linux-builder
DOCKER_RUN = docker run --rm -v "$(PWD)":/project -w /project $(DOCKER_IMAGE)

build:
	mkdir -p $(BUILD_DIR)
	g++ $(CXXFLAGS) $(SRC) -o $(BUILD_DIR)/$(BIN_NAME) $(LDFLAGS)

cross: 
	mkdir -p $(BUILD_DIR)
	$(MAKE) macos_x86_64
	$(MAKE) macos_arm64
	$(MAKE) linux_x86_64
	$(MAKE) linux_arm64

macos_x86_64:
	clang++ $(CXXFLAGS) -arch x86_64 $(SRC) -o $(BUILD_DIR)/$(BIN_NAME)-macos-x86_64 $(LDFLAGS)

macos_arm64:
	clang++ $(CXXFLAGS) -arch arm64 $(SRC) -o $(BUILD_DIR)/$(BIN_NAME)-macos-arm64 $(LDFLAGS)

linux_x86_64:
ifeq ($(IS_MACOS),Darwin)
	@echo "Building linux_x86_64 in Docker..."
	@docker build -f Dockerfile.buildenv -t $(DOCKER_IMAGE) .
	@$(DOCKER_RUN) make linux_x86_64_internal
else
	$(MAKE) linux_x86_64_internal
endif

linux_arm64:
ifeq ($(IS_MACOS),Darwin)
	@echo "Building linux_arm64 in Docker..."
	@docker build -f Dockerfile.buildenv -t $(DOCKER_IMAGE) .
	@$(DOCKER_RUN) make linux_arm64_internal
else
	$(MAKE) linux_arm64_internal
endif

linux_x86_64_internal:
	g++ $(CXXFLAGS) -pthread $(SRC) -o $(BUILD_DIR)/$(BIN_NAME)-linux-x86_64 $(LDFLAGS)

linux_arm64_internal:
	g++ $(CXXFLAGS) -pthread $(SRC) -o $(BUILD_DIR)/$(BIN_NAME)-linux-arm64 $(LDFLAGS)

clean:
	rm -r $(BUILD_DIR) || true
	rm -r .shardconfig || true
	@if [ -d $(DATA_DIR) ]; then \
		if [ -z "$$(ls -A $(DATA_DIR))" ]; then \
			rm -r $(DATA_DIR); \
		else \
			echo "Warning: $(DATA_DIR) is not empty"; \
		fi \
	fi

.PHONY: all clean macos_x86_64 macos_arm64 linux_x86_64 linux_arm64
