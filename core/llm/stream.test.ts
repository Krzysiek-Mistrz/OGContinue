import { StreamStallError, withStallTimeout } from "./stream";

async function* neverYields(): AsyncGenerator<string> {
  await new Promise(() => {
    // Never resolves - simulates a connection that stopped producing data.
  });
  yield "unreachable";
}

async function* yieldsThenStalls(
  values: string[],
): AsyncGenerator<string> {
  for (const value of values) {
    yield value;
  }
  await new Promise(() => {
    // Stalls after producing some real output.
  });
}

async function* yieldsNormally(values: string[]): AsyncGenerator<string> {
  for (const value of values) {
    yield value;
  }
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of gen) {
    out.push(value);
  }
  return out;
}

describe("withStallTimeout", () => {
  test("passes through values from a healthy stream", async () => {
    const result = await collect(
      withStallTimeout(yieldsNormally(["a", "b", "c"]), 50),
    );
    expect(result).toEqual(["a", "b", "c"]);
  });

  test("throws StreamStallError if no chunk ever arrives", async () => {
    await expect(collect(withStallTimeout(neverYields(), 20))).rejects.toThrow(
      StreamStallError,
    );
  });

  test("throws StreamStallError if the stream goes silent mid-stream", async () => {
    const gen = withStallTimeout(yieldsThenStalls(["first", "second"]), 20);
    const collected: string[] = [];
    await expect(
      (async () => {
        for await (const value of gen) {
          collected.push(value);
        }
      })(),
    ).rejects.toThrow(StreamStallError);
    expect(collected).toEqual(["first", "second"]);
  });
});
