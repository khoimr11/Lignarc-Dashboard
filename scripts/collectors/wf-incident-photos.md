# Wayfair incident photos → dashboard (weekly task)

Partner Home photo URLs (`/d/incidents-resolutions-dashboard/api/proxy-image?token=…`) only work inside a signed-in Partner Home tab,
and the browser GitHub token cannot write this repo, so photos travel like this:

1. Partner Home tab (https://partners.wayfair.com/d/incidents-resolutions-dashboard/cir): inject a fixed button and click it
   (real click = popup allowed) to `window.open` https://khoimr11.github.io/Lignarc-Dashboard/sync.html (needs the data key saved there).
2. In the sync tab, inject a `message` listener for `{type:'lg-enc', b64}` from partners.wayfair.com that AES-GCM-encrypts the bytes with
   `localStorage['lg-dk']` and replies `{type:'lg-ack', id, ok, result: JSON.stringify({iv, ct})}`.
3. Partner Home collector: for each part → each PO with photos → click the photo count, collect new `img[src*=proxy-image]`,
   `fetch` each, downscale to ≤1400 px JPEG q0.82, send to the sync tab, keep the encrypted JSON as `wf-<po lowercase>-<n>`.
4. Inject a second button that opens https://github.com/khoimr11/Lignarc-Dashboard/upload/main/data/media, inject a listener there
   for `{type:'lg-file', name, body}`, post all files, put them on the upload `input[type=file]` with a DataTransfer, commit to main.
5. In the repo: set `incidents.cases[].media` = file names (and `photos`), review each photo set (match / mismatch / listing-conflict /
   pending) and blur any notification banners or personal details visible in screenshots before re-encrypting.
