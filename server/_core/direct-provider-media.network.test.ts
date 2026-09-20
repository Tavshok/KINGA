import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const { lookupMock, requestMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  requestMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));
vi.mock("node:https", () => ({ request: requestMock }));

import { loadDirectProviderMedia } from "./direct-provider-media";

type FakeResponse = EventEmitter & {
  statusCode: number;
  headers: Record<string, string>;
  resume: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function fakeResponse(
  statusCode: number,
  headers: Record<string, string> = {}
): FakeResponse {
  const response = new EventEmitter() as FakeResponse;
  response.statusCode = statusCode;
  response.headers = headers;
  response.resume = vi.fn();
  response.destroy = vi.fn();
  return response;
}

function fakeRequest(onEnd: () => void) {
  const request = new EventEmitter() as EventEmitter & {
    end: () => void;
    destroy: ReturnType<typeof vi.fn>;
  };
  request.end = onEnd;
  request.destroy = vi.fn();
  return request;
}

const config = { allowedHosts: ["objects.example.test"], maxBytes: 8 };

afterEach(() => {
  vi.clearAllMocks();
});

describe("pinned direct-provider media retrieval", () => {
  it("rejects a private DNS answer before an HTTPS request is made", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.8", family: 4 }]);

    await expect(
      loadDirectProviderMedia(
        "https://objects.example.test/evidence.pdf",
        "application/pdf",
        config
      )
    ).rejects.toThrow("non-public address");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("pins the resolved public address into the HTTPS lookup callback", async () => {
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    const response = fakeResponse(200, { "content-type": "application/pdf" });
    let pinned: { address?: string; family?: number } = {};
    requestMock.mockImplementation((options, callback) => {
      const request = fakeRequest(() => {
        options.lookup(
          "objects.example.test",
          {},
          (_error: unknown, address: string, family: number) => {
            pinned = { address, family };
            callback(response);
            response.emit("data", Buffer.from("pdf"));
            response.emit("end");
          }
        );
      });
      return request;
    });

    const media = await loadDirectProviderMedia(
      "https://objects.example.test/evidence.pdf",
      "application/pdf",
      config
    );
    expect(pinned).toEqual({ address: "8.8.8.8", family: 4 });
    expect(media).toEqual({
      data: Buffer.from("pdf").toString("base64"),
      mimeType: "application/pdf",
    });
  });

  it("rejects redirects without following another request", async () => {
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    const response = fakeResponse(302, {
      location: "https://other.example.test/file",
    });
    requestMock.mockImplementation((_options, callback) => {
      const request = fakeRequest(() => callback(response));
      return request;
    });

    await expect(
      loadDirectProviderMedia(
        "https://objects.example.test/evidence.pdf",
        "application/pdf",
        config
      )
    ).rejects.toThrow("must not redirect");
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(response.resume).toHaveBeenCalledOnce();
  });

  it("destroys a chunked oversized response before it is aggregated", async () => {
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    const response = fakeResponse(200, { "content-type": "application/pdf" });
    let request: ReturnType<typeof fakeRequest> | undefined;
    requestMock.mockImplementation((_options, callback) => {
      request = fakeRequest(() => {
        callback(response);
        response.emit("data", Buffer.alloc(9));
      });
      return request;
    });

    await expect(
      loadDirectProviderMedia(
        "https://objects.example.test/evidence.pdf",
        "application/pdf",
        config
      )
    ).rejects.toThrow("exceeds 8 bytes");
    expect(request?.destroy).toHaveBeenCalledOnce();
    expect(response.destroy).toHaveBeenCalledOnce();
  });
});
