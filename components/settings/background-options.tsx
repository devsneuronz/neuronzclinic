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
  {
    id: "default-img",
    name: "Clínica",
    value: "url('/bgs/bgdefault.png')",
  },
  {
    id: "aurora",
    name: "Aurora",
    value: "radial-gradient(circle at 25% 20%, rgba(20, 184, 166, .45), transparent 30%), linear-gradient(135deg, #111827 0%, #2563eb 48%, #f8fafc 100%)",
  },
  {
    id: "soft-light",
    name: "Claro suave",
    value: "linear-gradient(135deg, #f8fafc 0%, #dbeafe 48%, #fce7f3 100%)",
  },
  {
    id: "graphite",
    name: "Grafite",
    value: "linear-gradient(135deg, #111827 0%, #334155 58%, #64748b 100%)",
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
  const [currentBg, setCurrentBg] = useState(() => {
    if (typeof window === "undefined") return "abs1";
    return localStorage.getItem("selected-login-bg-id") ?? "abs1";
  });

  useEffect(() => {
    const savedBgVal = localStorage.getItem("selected-login-bg-val");

    if (savedBgVal) {
      document.documentElement.style.setProperty("--login-custom-bg", savedBgVal);
    }
  }, []);

  const handleSelectBackground = (id: string, value: string) => {
    setCurrentBg(id);
    updateLoginBackground(id, value); // Passando ambos
  };

  return (
    <section className="h-full rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-semibold text-foreground">Fundo do login</Label>
          <p className="mt-1 text-xs text-muted-foreground">Defina a imagem ou composição usada na tela de entrada.</p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
            {backgroundOptionsOpts.map((bg) => {
              const isSelected = currentBg === bg.id;

              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => handleSelectBackground(bg.id, bg.value)}
                  className="relative aspect-[4/3] cursor-pointer select-none overflow-hidden rounded-lg border transition-all group bg-popover text-left hover:border-theme-primary/50"
                  style={{
                    borderColor: isSelected ? "var(--color-theme-primary)" : "var(--border)",
                  }}
                >
                  <div className="absolute inset-0 bg-cover bg-center opacity-90" style={{ backgroundImage: bg.value }}>
                    <div className="absolute inset-0 mix-blend-color opacity-90 bg-theme-primary" />
                    <div
                      className="absolute h-full backdrop-blur-md right-0 w-4/5"
                      style={{
                        WebkitMaskImage: "linear-gradient(280deg, black 45%, transparent 75%)",
                        maskImage: "linear-gradient(280deg, black 45%, transparent 75%)",
                      }}
                    />
                  </div>

                  <div className="relative z-10 flex h-full flex-col justify-between p-2.5">
                    <span className="h-2 w-10 rounded-sm bg-white/45 shadow-xs" />

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
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-theme-primary text-theme-primary-fg shadow-md border border-card">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-2 right-2 z-20 max-w-[80%] truncate rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">{bg.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
