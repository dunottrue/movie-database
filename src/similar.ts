import type { Movie } from "./types";

const STOPWORDS = new Set(
  "и в во не на я он а но они или же как что к надо так только с для вот у мы вас вы за по своей под из без будто было потому этого какой также могу его их если бы есть значит вообще то нет где даже это все свои свой уже тут когда очень уж ему ей них нам мне от до о ещё ж бы всё быть фильм фильма фильмы фильмов герой героя герои история истории историям которых который которая которые которое через между над после этот эти того тем его этим этого самый сам сама самом самое весь вся всем всею была были было — и".split(/\s+/g)
);

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of String(text || "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    const w = raw.length > 4 ? raw.slice(0, 32) : raw;
    if (w.length >= 4 && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

export function findSimilar(movie: Movie, movies: Movie[], limit = 3): Movie[] {
  const others = movies.filter((m) => m.id !== movie.id);
  const scored = others
    .map((m) => ({ m, score: similarity(movie, m) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.m);
}

export function similarity(a: Movie, b: Movie): number {
  let score = 0;
  if (a.genre && a.genre.toLowerCase() === b.genre?.toLowerCase()) score += 4;
  if (a.year && a.year === b.year) score += 1;

  const aDesc = tokens(a.description);
  const bDesc = tokens(b.description);
  score += overlap(aDesc, bDesc) * 2;

  const aTitle = tokens(a.title);
  const bTitle = tokens(b.title);
  if (overlap(aTitle, bTitle) > 0) score += 2;

  return score;
}