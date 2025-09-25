from google.cloud import storage
import os

os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'your-credentials.json'
BUCKET_NAME = 'your-gcs-bucket-name'

def upload_video_to_gcs(file):
    client = storage.Client()
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(file.filename)
    blob.upload_from_file(file)
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{file.filename}"
