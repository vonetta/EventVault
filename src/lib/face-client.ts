"use client";

import {
  isValidDescriptor,
  matchFace,
  type FaceDescriptor,
  type FaceLabeledProfile,
} from "@/lib/face-match";

export type DetectedFace = {
  id: string;
  box: { x: number; y: number; width: number; height: number };
  descriptor: FaceDescriptor;
};

type FaceApiModule = typeof import("@vladmandic/face-api");

let modelsReady: Promise<FaceApiModule> | null = null;

/** Load tiny face detector + landmarks + recognition nets once per session. */
export async function loadFaceModels() {
  if (!modelsReady) {
    modelsReady = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      // Prefer CPU so tagging works on machines without WebGL (common in VMs / CI).
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
      const modelUrl = "/models/face-api";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
        faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl),
      ]);
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

export async function detectFacesInImage(url: string): Promise<DetectedFace[]> {
  const faceapi = await loadFaceModels();
  const img = await loadImageElement(url);
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
  const results = await faceapi
    .detectAllFaces(img, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return results.map((result, index) => {
    const box = result.detection.box;
    return {
      id: `face-${index}-${Math.round(box.x)}-${Math.round(box.y)}`,
      box: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
      descriptor: Array.from(result.descriptor) as FaceDescriptor,
    };
  });
}

export function bestMatch(
  descriptor: FaceDescriptor,
  profiles: FaceLabeledProfile[],
  threshold = 0.55,
) {
  return matchFace(descriptor, profiles, threshold);
}

export function descriptorFromUnknown(value: unknown): FaceDescriptor | null {
  return isValidDescriptor(value) ? value : null;
}
