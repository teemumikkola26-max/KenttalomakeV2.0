/* =========================================================================
   camera.js – kameran esikatselu ja kuvan otto
   Ensisijaisesti selaimen kamera (getUserMedia, takakamera). Jos se ei
   onnistu, käytetään puhelimen kamerasovellusta tiedostovalitsimen kautta.
   ========================================================================= */
(function () {
  "use strict";

  const MAX_EDGE = 2048;   // kuvan pidempi sivu pikseleinä
  const QUALITY = 0.85;

  const Camera = {
    stream: null,

    async start(video) {
      Camera.stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no-camera");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }
      });
      Camera.stream = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      video.muted = true;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        }
      } catch (e) { /* ei tuettu */ }
      return stream;
    },

    stop() {
      if (Camera.stream) {
        Camera.stream.getTracks().forEach((t) => t.stop());
        Camera.stream = null;
      }
    },

    async capture(video) {
      const track = Camera.stream && Camera.stream.getVideoTracks()[0];
      // Täysresoluutioinen kuva, jos selain tukee (Chrome/Android).
      if (track && window.ImageCapture) {
        try {
          const ic = new ImageCapture(track);
          const blob = await ic.takePhoto();
          return await Camera.shrink(blob);
        } catch (e) { /* palataan esikatselukuvaan */ }
      }
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) throw new Error("Kamera ei ole valmis.");
      const s = Math.min(1, MAX_EDGE / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.round(w * s); c.height = Math.round(h * s);
      c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
      return await new Promise((res) => c.toBlob(res, "image/jpeg", QUALITY));
    },

    /* Pienentää kuvan ja kääntää sen EXIF-suunnan mukaan. */
    async shrink(blob, maxEdge) {
      let bmp;
      try { bmp = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
      catch (e) {
        bmp = await new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = URL.createObjectURL(blob);
        });
      }
      const w = bmp.width, h = bmp.height;
      const s = Math.min(1, (maxEdge || MAX_EDGE) / Math.max(w, h));
      // Kuva piirretään aina uudelleen: sijainti- ja laitetiedot (EXIF/GPS) eivät päädy tallenteisiin.
      const c = document.createElement("canvas");
      c.width = Math.round(w * s); c.height = Math.round(h * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise((res) => c.toBlob(res, "image/jpeg", QUALITY));
    }
  };

  window.Camera = Camera;
})();
