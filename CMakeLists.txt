cmake_minimum_required(VERSION 3.20)
project(routeforge CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Optimization for fast compile times in containers
set(CMAKE_CXX_FLAGS_RELEASE "-O2 -DNDEBUG")

include_directories(include)

# Multi-threading support for HTTP server
find_package(Threads)

# 1. Core library with candidate-editable services
file(GLOB_RECURSE CORE_SOURCES "src/service/*.cpp")
add_library(core_services STATIC ${CORE_SOURCES})

# 2. Main Web Server Target (name MUST match what start.sh executes)
add_executable(server src/main.cpp)
target_link_libraries(server PRIVATE core_services)
if(CMAKE_THREAD_LIBS_INIT)
    target_link_libraries(server PRIVATE "${CMAKE_THREAD_LIBS_INIT}")
endif()
if(WIN32)
    target_link_libraries(server PRIVATE ws2_32)
endif()

# 3. Test Runner Target (name MUST match what tests/run_tests.sh executes)
add_executable(challenge_tests tests/test_suite.cpp)
target_link_libraries(challenge_tests PRIVATE core_services)
if(CMAKE_THREAD_LIBS_INIT)
    target_link_libraries(challenge_tests PRIVATE "${CMAKE_THREAD_LIBS_INIT}")
endif()
if(WIN32)
    target_link_libraries(challenge_tests PRIVATE ws2_32)
endif()
