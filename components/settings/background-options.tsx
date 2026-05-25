import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { useState } from "react";

const backgroundOptionsOpts = [
  {
    id: "default",
    name: "",
    value: "url(https://images.pexels.com/photos/33797647/pexels-photo-33797647.jpeg?_gl=1*1r1azh5*_ga*MjE3MDg1NjY4LjE3Nzk3MjQ0Nzk.*_ga_8JE65Q40S6*czE3Nzk3MjQ0NzkkbzEkZzAkdDE3Nzk3MjQ0NzkkajYwJGwwJGgw)",
    isDarkBg: true,
  },
];

export function BackgroundOptions() {
  const [currentBg, setCurrentBg] = useState("default");

  return (
    <Card className="border border-border bg-card shadow-sm w-full h-full">
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Fundo do Login</Label>

          <div className="grid grid-cols-3 gap-3 bg-muted/10 p-3 rounded-xl border border-border/40">
            {backgroundOptionsOpts.map((bg) => {
              const isSelected = currentBg === bg.id;

              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setCurrentBg(bg.id)}
                  className="relative overflow-hidden rounded-xl aspect-3/4 border-2 transition-all group select-none text-left cursor-pointer bg-popover"
                  style={{
                    borderColor: isSelected ? "var(--theme-primary)" : "transparent",
                  }}
                >
                  <div
                    className="absolute inset-0 top-1/2 left-1/2 -translate-1/2 w-[140%] h-[140%] bg-cover aspect-4/3 rotate-90 bg-center opacity-80"
                    style={{
                      backgroundImage: bg.value,
                    }}
                  >
                    <div className="absolute inset-0 mix-blend-color opacity-80 bg-theme-primary" />

                    <div
                      className="absolute h-full backdrop-blur-md right-0 w-4/5"
                      style={{
                        WebkitMaskImage: "linear-gradient(280deg, black 45%, transparent 75%)",
                        maskImage: "linear-gradient(280deg, black 45%, transparent 75%)",
                      }}
                    />
                  </div>

                  <div className="relative flex h-full flex-col justify-between p-3.5 z-10">
                    <span className="text-[12px] uppercase">Logo</span>

                    <div className="space-y-1.5">
                      <div className="h-2 w-14 rounded-xs bg-white/20 border border-white/5 backdrop-blur-xs" />

                      <div className="space-y-1">
                        <div className="h-2.5 w-full rounded-xs bg-white/80" />
                        <div className="h-2.5 w-4/5 rounded-xs bg-white/80" />
                      </div>
                      <div className="space-y-1 pt-0.5">
                        <div className="h-1 w-11/12 rounded-xs bg-white/40" />
                        <div className="h-1 w-10/12 rounded-xs bg-white/40" />
                      </div>
                    </div>

                    <div className="grid gap-1.5">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <div className="h-1 w-1/3 rounded-xs bg-white/50" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="absolute inset-0 bg-bacground/5  flex items-center justify-center z-20 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm border border-card dynamic-check animate-in fade-in zoom-in-50 duration-150">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </div>
                    </div>
                  )}

                  <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-xs text-xs text-white font-medium px-2 py-1 rounded-full z-20">{bg.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

