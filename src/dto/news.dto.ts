export type NewsCtaDto = {
  enabled: boolean;
  text: string;
  url: string;
};

export interface CreateNewsDto {
  title: string;
  heroImage?: string;
  content: string;
  cta?: NewsCtaDto;
  enabled?: boolean;
}

export interface UpdateNewsDto {
  title?: string;
  heroImage?: string;
  content?: string;
  cta?: NewsCtaDto;
  enabled?: boolean;
}

export interface NewsOutDto {
  id: string;
  apiKeyId: string;
  title: string;
  heroImage: string;
  content: string;
  cta: NewsCtaDto;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewsMediaOutDto {
  mediaId: string;
  url: string;
}

export interface PublicNewsListItemOutDto {
  id: string;
  title: string;
  heroImage: string;
  excerpt: string;
  createdAt: string;
}

export interface PublicNewsDetailOutDto {
  id: string;
  title: string;
  heroImage: string;
  content: string;
  cta: NewsCtaDto;
  createdAt: string;
  updatedAt: string;
}
