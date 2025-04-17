SRC = src/shard.cpp
BUILD_DIR = bin
DATA_DIR = .data
BIN_NAME = shard
CXXFLAGS = -O2 -std=c++17 -lcurl

all: build run

build:
	mkdir -p $(BUILD_DIR)
	g++ $(CXXFLAGS) $(SRC) -o $(BUILD_DIR)/$(BIN_NAME)

run:
	./$(BUILD_DIR)/$(BIN_NAME)

cross: 
	mkdir -p $(BUILD_DIR)
	$(MAKE) macos_x86_64
	$(MAKE) macos_arm64
	$(MAKE) linux_x86_64
	$(MAKE) linux_arm64

macos_x86_64:
	clang++ $(CXXFLAGS) -arch x86_64 $(SRC) -o $(BUILD_DIR)/$(BIN_NAME)-macos-x86_64

macos_arm64:
	clang++ $(CXXFLAGS) -arch arm64 $(SRC) -o $(BUILD_DIR)/$(BIN_NAME)-macos-arm64

linux_x86_64:
	x86_64-unknown-linux-gnu-g++ $(CXXFLAGS) -pthread $(SRC) -o $(BUILD_DIR)/$(BIN_NAME)-linux-x86_64

linux_arm64:
	aarch64-unknown-linux-gnu-g++ $(CXXFLAGS) -pthread $(SRC) -o $(BUILD_DIR)/$(BIN_NAME)-linux-arm64

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
