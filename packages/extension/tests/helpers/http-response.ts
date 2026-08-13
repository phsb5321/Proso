export function jsonResponse(
  data: unknown,
  status = 200,
  headers: HeadersInit = {},
  statusText = 'OK',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(headers),
    redirected: false,
    statusText,
    type: 'basic',
    url: '',
    clone: () => jsonResponse(data, status, headers, statusText),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(''),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

export function binaryResponse(blob: Blob, status = 200, headers: HeadersInit = {}): Response {
  return {
    ...jsonResponse({}, status, headers),
    blob: () => Promise.resolve(blob),
    clone: () => binaryResponse(blob, status, headers),
  } as Response;
}
