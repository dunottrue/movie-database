export interface Comment {
  id: string;
  name: string;
  text: string;
  parentId: string | null;
  addedAt: string;
  editedAt: string | null;
  authorId: string | null;
}

export interface Movie {
  id: string;
  title: string;
  year: string;
  genre: string;
  genres: string[];
  description: string;
  source: string;
  videoUrl: string | null;
  subtitles: string | null;
  posterUrl: string;
  videoSize: number | null;
  addedAt: string;
  comments: Comment[];
  tags: string[];
  ratings: { imdb: string; kinopoisk: string };
  isNew: boolean;
  newUntil: string | null;
  votes: { voter: string; value: number }[];
  siteRating: number | null;
  voteCount: number;
  kinopoiskId?: string | null;
  fromKinopoisk?: boolean;
}

export type SortField = "added" | "year" | "title" | "size" | "rating" | "imdb" | "kp";
export type SortDir = "asc" | "desc";

export const SORT_LABELS: Record<SortField, string> = {
  added: "Дата добавления",
  year: "Год выпуска",
  title: "Название",
  size: "Размер видео",
  rating: "Рейтинг сайта",
  imdb: "Оценка IMDB",
  kp: "Оценка Кинопоиск",
};