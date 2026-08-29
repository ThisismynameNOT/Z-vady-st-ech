import type {
  Client,
  Media,
  MediaList,
  MediaListOptions,
  MediaStore,
  MediaUploadOptions,
} from 'tinacms';
import { sanitizeFilename } from 'tinacms';

export class RoofingCloudinaryMediaStore implements MediaStore {
  client: Client;
  accept = 'image/*';
  baseUrl = '/api/cloudinary/media';

  constructor(client: Client) {
    this.client = client;
  }

  private fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    return this.client.authProvider.fetchWithToken(input.toString(), init);
  }

  async persist(media: MediaUploadOptions[]): Promise<Media[]> {
    const output: Media[] = [];

    for (const item of media) {
      const fileName = sanitizeFilename(item.file.name);
      const formData = new FormData();
      formData.append('file', item.file, fileName);

      const response = await this.fetch(this.baseUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: 'Upload failed' }))) as {
          message?: string;
        };
        throw new Error(error.message || 'Upload failed');
      }

      const uploaded = (await response.json()) as {
        public_id: string;
        original_filename?: string;
        secure_url: string;
      };

      output.push({
        type: 'file',
        id: uploaded.public_id,
        filename: uploaded.original_filename || fileName,
        directory: '/',
        src: uploaded.secure_url,
        thumbnails: {
          '75x75': uploaded.secure_url,
          '400x400': uploaded.secure_url,
          '1000x1000': uploaded.secure_url,
        },
      });
    }

    return output;
  }

  async delete(media: Media): Promise<void> {
    const response = await this.fetch(
      `${this.baseUrl}/${encodeURIComponent(media.id)}`,
      { method: 'DELETE' },
    );
    if (!response.ok) throw new Error('Delete failed');
  }

  async list(options: MediaListOptions): Promise<MediaList> {
    const query = new URLSearchParams();
    if (options.limit) query.set('limit', String(options.limit));
    if (options.offset) query.set('offset', String(options.offset));

    const response = await this.fetch(`${this.baseUrl}?${query}`);
    if (!response.ok) throw new Error('Media list failed');
    return (await response.json()) as MediaList;
  }

  parse = (media: Media): string => media.src || '';
}

export default RoofingCloudinaryMediaStore;
