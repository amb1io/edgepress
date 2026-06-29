export interface MigrationImage {
  filename: string;
  relativePath: string;
  r2Key: string;
  mediaUrl: string;
  mimeType: string;
}

export interface MigrationPost {
  slug: string;
  title: string;
  description: string;
  publishDate: string;
  publishedAt: number;
  body_html: string;
  images: MigrationImage[];
  coverImage?: MigrationImage;
  translation_key: string;
}

export interface MigrationData {
  source: string;
  extractedAt: string;
  posts: MigrationPost[];
}
