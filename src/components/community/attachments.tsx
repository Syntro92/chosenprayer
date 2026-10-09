"use client";

import { useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, X } from "lucide-react";
import { fileTypeLabel, formatBytes } from "@/lib/community/format";
import type { Attachment } from "@/lib/community/types";
import { useCommunity } from "./community-provider";
import { Modal, focus } from "./ui";

/** Image with a placeholder and fixed aspect ratio so nothing shifts as it loads. */
function Thumb({ a, className = "" }: { a: Attachment; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`relative block overflow-hidden bg-mist ${className}`}>
      {!loaded && <span aria-hidden className="absolute inset-0 animate-pulse bg-mist motion-reduce:animate-none" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={a.src}
        alt={a.alt ?? a.name}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`size-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </span>
  );
}

export function ImageGallery({ images }: { images: Attachment[] }) {
  const [index, setIndex] = useState<number | null>(null);
  if (!images.length) return null;

  const grid =
    images.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <>
      <ul className={`mt-3 grid gap-1.5 overflow-hidden rounded-2xl ${grid}`}>
        {images.map((a, i) => (
          <li
            key={a.id}
            className={images.length === 3 && i === 0 ? "col-span-2" : ""}
          >
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Open image: ${a.alt ?? a.name}`}
              className={`block w-full ${focus}`}
            >
              <Thumb
                a={a}
                className={images.length === 1 ? "aspect-[4/3]" : images.length === 3 && i === 0 ? "aspect-[2/1]" : "aspect-square"}
              />
            </button>
          </li>
        ))}
      </ul>
      <Lightbox images={images} index={index} onIndex={setIndex} />
    </>
  );
}

export function Lightbox({
  images,
  index,
  onIndex,
}: {
  images: Attachment[];
  index: number | null;
  onIndex: (i: number | null) => void;
}) {
  const id = useId();
  const open = index !== null;
  const current = index !== null ? images[index] : undefined;
  const many = images.length > 1;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!many || index === null) return;
      if (e.key === "ArrowRight") onIndex((index + 1) % images.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, many, index, images.length, onIndex]);

  const nav = `absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-charcoal-deep shadow transition hover:bg-white ${focus}`;

  return (
    <Modal open={open} onClose={() => onIndex(null)} labelledBy={id} className="max-w-4xl" bare>
      {current && (
        <div className="relative">
          <h2 id={id} className="sr-only">
            {current.alt ?? current.name} ({(index ?? 0) + 1} of {images.length})
          </h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.src}
            alt={current.alt ?? current.name}
            className="mx-auto max-h-[80vh] w-auto max-w-full rounded-2xl bg-white object-contain"
          />
          <button
            type="button"
            onClick={() => onIndex(null)}
            aria-label="Close image viewer"
            className={`absolute right-2 top-2 flex size-10 items-center justify-center rounded-full bg-white/90 text-charcoal-deep shadow ${focus}`}
          >
            <X size={18} aria-hidden />
          </button>
          {many && (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={() => onIndex(((index ?? 0) - 1 + images.length) % images.length)}
                className={`${nav} left-2`}
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={() => onIndex(((index ?? 0) + 1) % images.length)}
                className={`${nav} right-2`}
              >
                <ChevronRight size={20} aria-hidden />
              </button>
              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-charcoal-deep/75 px-3 py-1 text-xs text-white" aria-hidden>
                {(index ?? 0) + 1} / {images.length}
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

export function FileRow({ a }: { a: Attachment }) {
  const { toast } = useCommunity();
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-ivory p-3">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-charcoal-deep">
        <FileText size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-all text-sm font-medium leading-snug text-charcoal-deep">{a.name}</p>
        <p className="text-xs text-slate">
          {fileTypeLabel(a.name)} · {formatBytes(a.size)}
        </p>
      </div>
      {a.href ? (
        <a
          href={a.href}
          download={a.name}
          aria-label={`Download ${a.name}`}
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-slate transition-colors hover:bg-charcoal-deep/5 hover:text-charcoal-deep ${focus}`}
        >
          <Download size={18} aria-hidden />
        </a>
      ) : (
        <button
          type="button"
          aria-label={`Download ${a.name}`}
          onClick={() => toast("Demo file: no real download is attached yet.", "info")}
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-slate transition-colors hover:bg-charcoal-deep/5 hover:text-charcoal-deep ${focus}`}
        >
          <Download size={18} aria-hidden />
        </button>
      )}
    </li>
  );
}

export function Attachments({ attachments }: { attachments: Attachment[] }) {
  const images = attachments.filter((a) => a.kind === "image");
  const files = attachments.filter((a) => a.kind === "file");
  return (
    <>
      <ImageGallery images={images} />
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <FileRow key={f.id} a={f} />
          ))}
        </ul>
      )}
    </>
  );
}
