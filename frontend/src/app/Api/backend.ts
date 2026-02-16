// src/api/backend.ts
export const API_URL = "https://dance-perfect-backend-service.onrender.com";

export async function uploadMotFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  return response.json();
}
