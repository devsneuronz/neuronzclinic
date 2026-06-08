import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";

const backgroundOptionsOpts = [
  {
    id: "solid",
    name: "Cor sólida",
    value: "var(--sidebar-custom-primary)",
  },
  {
    id: "abs1",
    name: "3D",
    value: "url(https://images.pexels.com/photos/33797647/pexels-photo-33797647.jpeg?_gl=1*1r1azh5*_ga*MjE3MDg1NjY4LjE3Nzk3MjQ0Nzk.*_ga_8JE65Q40S6*czE3Nzk3MjQ0NzkkbzEkZzAkdDE3Nzk3MjQ0NzkkajYwJGwwJGgw)",
  },

  {
    id: "3D ",
    name: "3D 2",
    value: "url('/bgs/3D-2.jpg')",
  },
  {
    id: "abs3",
    name: "Formas",
    value: "url(https://img.magnific.com/free-vector/realistic-3d-shapes-floating-background_23-2148907251.jpg?t=st=1779741447~exp=1779745047~hmac=4e4e0b7fd1d394e3996728748b4621783704f7d9ff5ad3acfbb39604532a7826&w=1480)",
  },
  {
    id: "gradient",
    name: "Gradiente 1",
    value: "url(/bgs/gradient1.avif)",
  },
  {
    id: "gradient 2",
    name: "Gradiente 2",
    value: "url('/bgs/gradient2.avif')",
  },
];

const updateLoginBackground = (backgroundId: string, backgroundValue: string) => {
  if (typeof window !== "undefined") {
    document.documentElement.style.setProperty("--login-custom-bg", backgroundValue);

    localStorage.setItem("selected-login-bg-id", backgroundId);
    localStorage.setItem("selected-login-bg-val", backgroundValue);
  }
};

export function BackgroundOptions() {
  const [currentBg, setCurrentBg] = useState("abs1");

  useEffect(() => {
    const savedBgId = localStorage.getItem("selected-login-bg-id");
    const savedBgVal = localStorage.getItem("selected-login-bg-val");

    if (savedBgId && savedBgVal) {
      setCurrentBg(savedBgId);
      document.documentElement.style.setProperty("--login-custom-bg", savedBgVal);
    }
  }, []);

  const handleSelectBackground = (id: string, value: string) => {
    setCurrentBg(id);
    updateLoginBackground(id, value); // Passando ambos
  };

  return (
    <Card className="border border-border bg-card shadow-sm w-full h-full overflow-hidden p-0">
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="space-y-3">
          <Label className="text-sm font-medium text-foreground">Fundo do Login</Label>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(105px,1fr))] gap-3">
            {backgroundOptionsOpts.map((bg) => {
              const isSelected = currentBg === bg.id;

              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => handleSelectBackground(bg.id, bg.value)}
                  className="relative overflow-hidden rounded-xl aspect-3/4 border-2 transition-all group select-none text-left cursor-pointer bg-popover hover:border-border/80"
                  style={{
                    borderColor: isSelected ? "var(--theme-primary)" : "transparent",
                  }}
                >
                  <div className="absolute inset-0 top-1/2 left-1/2 -translate-1/2 w-[140%] h-[140%] aspect-4/3 rotate-90 bg-cover bg-center opacity-80" style={{ backgroundImage: bg.value }}>
                    <div className="absolute inset-0 mix-blend-color opacity-90 bg-theme-primary" />
                    <div
                      className="absolute h-full backdrop-blur-md right-0 w-4/5"
                      style={{
                        WebkitMaskImage: "linear-gradient(280deg, black 45%, transparent 75%)",
                        maskImage: "linear-gradient(280deg, black 45%, transparent 75%)",
                      }}
                    />
                  </div>

                  <div className="relative flex h-full flex-col justify-between p-2.5 z-10">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Logo</span>

                    <div className="space-y-1">
                      <div className="h-1.5 w-10 rounded-xs bg-white/20 border border-white/5 backdrop-blur-xs" />
                      <div className="space-y-0.5">
                        <div className="h-2 w-full rounded-xs bg-white/80" />
                        <div className="h-2 w-4/5 rounded-xs bg-white/80" />
                      </div>
                    </div>

                    <div className="grid gap-1">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-1">
                          <div className="h-1 w-1 rounded-full bg-emerald-400 shrink-0" />
                          <div className="h-0.5 w-8 rounded-xs bg-white/40" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="absolute inset-0 bg-background/10 flex items-center justify-center z-20 animate-in fade-in zoom-in-95 duration-100">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md border border-card">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-xs text-[10px] text-white font-medium px-2 py-0.5 rounded-md z-20 max-w-[80%] truncate">{bg.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
