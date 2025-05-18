SRC         := src/shard.cpp
BUILD_DIR   := bin
DATA_DIR    := .data
BIN_NAME    := shard

PREFIX      ?= /usr/local

CXXFLAGS    := -O2 -std=c++17 \
                -I$(PREFIX)/include \
                $(shell pkg-config --cflags prometheus-cpp 2>/dev/null)

LDFLAGS := -lcurl \
           -lprometheus-cpp-core \
           -lprometheus-cpp-pull \
           -L$(PREFIX)/lib \
           -Wl,-rpath,$(PREFIX)/lib \
           $(shell pkg-config --libs prometheus-cpp 2>/dev/null)

.PHONY: all deps build clean install

all: build

deps:
	rm -rf deps/prometheus-cpp
	git clone https://github.com/jupp0r/prometheus-cpp.git deps/prometheus-cpp
	cd deps/prometheus-cpp && git submodule init && git submodule update
	mkdir -p deps/prometheus-cpp/_build
	cd deps/prometheus-cpp/_build && \
	  cmake -DENABLE_PUSH=OFF -DENABLE_COMPRESSION=OFF -DBUILD_SHARED_LIBS=ON .. && \
	  cmake --build . --parallel 4 && \
	  cmake --install .

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
	@rm -rf deps/prometheus-cpp || true

install: build
	install -d $(DESTDIR)/usr/local/bin
	install $(BUILD_DIR)/$(BIN_NAME) $(DESTDIR)/usr/local/bin/$(BIN_NAME)
