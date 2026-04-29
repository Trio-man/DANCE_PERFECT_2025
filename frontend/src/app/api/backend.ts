// src/api/backend.ts
export const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function uploadMotFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/upload-videos`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  return response.json();
}
