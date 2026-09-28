"use client";

type FaceApiModule = typeof import("@vladmandic/face-api");

let modelsReady: Promise<FaceApiModule> | null = null;

/** Load tiny face detector only (group-shot counting — no recognition / tagging). */
export async function loadFaceModels() {
  if (!modelsReady) {
    modelsReady = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      // Prefer CPU so scanning works on machines without WebGL (common in VMs / CI).
      // face-api's bundled tf typings omit setBackend/ready — runtime still has them.
      try {
        const tf = faceapi.tf as unknown as {
          setBackend: (name: string) => Promise<boolean>;
          ready: () => Promise<void>;
        };
        await tf.setBackend("cpu");
        await tf.ready();
      } catch {
        // Fall through to whatever backend tfjs picks.
      }
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models/face-api");
      return faceapi;
    })();
  }
  return modelsReady;
}

export async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load photo for face scan"));
    img.src = url;
  });
}

/**
 * Fast face count only — for spotting group shots across large galleries.
 */
export async function countFacesInImage(url: string): Promise<number> {
  const faceapi = await loadFaceModels();
  const img = await loadImageElement(url);
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
  const results = await faceapi.detectAllFaces(img, options);
  return results.length;
}
