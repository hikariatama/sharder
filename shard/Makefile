SRC = src/shard.cpp
BUILD_DIR = bin
DATA_DIR = .data
BIN_NAME = shard
CXXFLAGS = -O2 -std=c++17
LDFLAGS = -lcurl

all: build

build:
	mkdir -p $(BUILD_DIR)
	g++ $(CXXFLAGS) $(SRC) -o $(BUILD_DIR)/$(BIN_NAME) $(LDFLAGS)

clean:
	rm -rf $(BUILD_DIR) || true
	rm -f .shardconfig || true
	@if [ -d $(DATA_DIR) ]; then \
		if [ -z "$$(ls -A $(DATA_DIR))" ]; then \
			rm -rf $(DATA_DIR); \
		else \
			echo "Warning: $(DATA_DIR) is not empty"; \
		fi \
	fi
