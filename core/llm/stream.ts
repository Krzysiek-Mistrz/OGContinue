async function* toAsyncIterable(
  nodeReadable: NodeJS.ReadableStream,
): AsyncGenerator<Uint8Array> {
  for await (const chunk of nodeReadable) {
    // @ts-ignore
    yield chunk as Uint8Array;
  }
}

// Time between chunks, not the whole request
const STREAM_STALL_TIMEOUT_MS = 3 * 60 * 1000;

export class StreamStallError extends Error {
  constructor(timeoutMs: number) {
    super(
      `No response from the model for ${Math.round(timeoutMs / 1000)}s - the request appears to have stalled. Try again, or check that the model server is still running.`,
    );
    this.name = "StreamStallError";
  }
}

export async function* withStallTimeout<T>(
  iterable: AsyncIterable<T>,
  timeoutMs: number,
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  while (true) {
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new StreamStallError(timeoutMs)),
        timeoutMs,
      );
    });

    let result: IteratorResult<T>;
    try {
      result = await Promise.race([iterator.next(), timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }

    if (result.done) {
      return;
    }
    yield result.value;
  }
}

export async function* streamResponse(
  response: Response,
): AsyncGenerator<string> {
  if (response.status !== 200) {
    throw new Error(await response.text());
  }

  if (!response.body) {
    throw new Error("No response body returned.");
  }

  // Get the major version of Node.js
  const nodeMajorVersion = parseInt(process.versions.node.split(".")[0], 10);

  if (nodeMajorVersion >= 20) {
    // Use the new API for Node 20 and above
    const stream = (ReadableStream as any).from(response.body);
    for await (const chunk of withStallTimeout<string>(
      stream.pipeThrough(new TextDecoderStream("utf-8")),
      STREAM_STALL_TIMEOUT_MS,
    )) {
      yield chunk;
    }
  } else {
    // Fallback for Node versions below 20
    // Streaming with this method doesn't work as version 20+ does
    const decoder = new TextDecoder("utf-8");
    const nodeStream = response.body as unknown as NodeJS.ReadableStream;
    for await (const chunk of withStallTimeout(
      toAsyncIterable(nodeStream),
      STREAM_STALL_TIMEOUT_MS,
    )) {
      yield decoder.decode(chunk, { stream: true });
    }
  }
}

function parseDataLine(line: string): any {
  const json = line.startsWith("data: ")
    ? line.slice("data: ".length)
    : line.slice("data:".length);

  try {
    const data = JSON.parse(json);
    if (data.error) {
      throw new Error(`Error streaming response: ${data.error}`);
    }

    return data;
  } catch (e) {
    throw new Error(`Malformed JSON sent from server: ${json}`);
  }
}

function parseSseLine(line: string): { done: boolean; data: any } {
  if (line.startsWith("data: [DONE]")) {
    return { done: true, data: undefined };
  }
  if (line.startsWith("data:")) {
    return { done: false, data: parseDataLine(line) };
  }
  if (line.startsWith(": ping")) {
    return { done: true, data: undefined };
  }
  return { done: false, data: undefined };
}

export async function* streamSse(response: Response): AsyncGenerator<any> {
  let buffer = "";
  for await (const value of streamResponse(response)) {
    buffer += value;

    let position: number;
    while ((position = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, position);
      buffer = buffer.slice(position + 1);

      const { done, data } = parseSseLine(line);
      if (done) {
        break;
      }
      if (data) {
        yield data;
      }
    }
  }

  if (buffer.length > 0) {
    const { done, data } = parseSseLine(buffer);
    if (!done && data) {
      yield data;
    }
  }
}

export async function* streamJSON(response: Response): AsyncGenerator<any> {
  let buffer = "";
  for await (const value of streamResponse(response)) {
    buffer += value;

    let position;
    while ((position = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, position);
      const data = JSON.parse(line);
      yield data;
      buffer = buffer.slice(position + 1);
    }
  }
}
