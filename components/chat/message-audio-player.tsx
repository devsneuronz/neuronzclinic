"use client";

import { Pause, PlayIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { memo, useCallback, useRef, useState } from "react";
import { formatTime } from "./message-utils";

export const MessageAudioPlayer = memo(function MessageAudioPlayer({ mediaUrl }: { mediaUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const onTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const total = audioRef.current.duration;
      setCurrentTime(current);
      setProgress((current / total) * 100);
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }, []);

  const handleSeek = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = percentage * audioRef.current.duration;
    }
  }, []);

  return (
    <div className="flex items-end gap-3 bg-(--chat-background)/40 p-2 rounded-xl">
      <button onClick={togglePlay} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--chat-primary) text-white hover:scale-105 transition-transform">
        {isPlaying ? <Pause size={20} fill="currentColor" /> : <PlayIcon size={20} className="ml-1" fill="currentColor" />}
      </button>

      <div className="flex flex-1 flex-col gap-1 pr-2">
        <div className="relative h-2 w-full bg-(--chat-muted-foreground)/20 rounded-full cursor-pointer" onClick={handleSeek}>
          <div className="absolute h-full bg-(--chat-primary) rounded-full" style={{ width: `${progress}%` }} />
          <div className="absolute h-4 w-4 bg-(--chat-primary) rounded-full -top-1 shadow-sm" style={{ left: `calc(${progress}% - 6px)` }} />
        </div>
        <div className="flex justify-between text-[10px] text-(--chat-muted-foreground) font-medium">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <audio ref={audioRef} src={mediaUrl} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={() => setIsPlaying(false)} className="hidden" />
    </div>
  );
});
