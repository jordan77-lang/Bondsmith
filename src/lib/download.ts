/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking synchronously after click() races the browser's fetch of the blob.
  // Chrome usually wins; Safari/Firefox can drop the download. Defer instead.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
