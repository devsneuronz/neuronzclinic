import { Send } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

// Dados
const trainingData = [{ id: 1, date: "12/05/26 15:48", received: "Teste", iaResponse: "Olá! Que bom receber seu contato...", quality: "Avaliar" }];

export function IATrainingView() {
  return (
    <div className="p-4 space-y-4 animate-in fade-in slide-in-from-right-4 bg-red-0">
      <Accordion type="single" collapsible className="w-full space-y-3">
        {trainingData.map((item) => (
          <AccordionItem key={item.id} value={`item-${item.id}`} className="border rounded-xl shadow-sm overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 transition-all items-center">
              <div className="flex items-center justify-between w-full pr-4">
                <div className="flex items-center gap-6">
                  <span className="text-sm font-bold text-theme-primary"># {item.id}</span>
                  <span className="text-sm text-muted-foreground truncate max-w-[150px]">{item.received}</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground min-w-[80px] text-center">{item.quality}</div>
                </div>
              </div>
            </AccordionTrigger>

            <AccordionContent className="px-4 pb-4 pt-2 border-t border-dashed">
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  <span>Data e Hora</span>
                  <span className="text-right">Qualidade da Resposta</span>
                </div>

                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">{item.date}</span>
                  <Select defaultValue="avaliar">
                    <SelectTrigger className="w-32 h-8 text-xs bg-muted/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avaliar">Avaliar</SelectItem>
                      <SelectItem value="bom">Bom</SelectItem>
                      <SelectItem value="ruim">Ruim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <h4 className="text-xs font-bold mb-2">Mensagem Recebida</h4>
                  <div className="bg-[#5fa77f]/20 text-(--chat-reply-me-border) px-3 py-1.5 rounded-md rounded-tl-none inline-block text-sm font-medium border border-(--chat-reply-me-border)/40">{item.received}</div>
                </div>

                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-blue-500/20 p-4 rounded-xl text-sm border border-blue-500/30 relative">
                    <h4 className="text-[10px] font-bold text-blue-400 mb-2 text-right uppercase tracking-tighter">Resposta IA</h4>
                    <p className="text-foreground text-right leading-relaxed">{item.iaResponse}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold">Mensagem Corrigida</h4>
                    <Textarea placeholder="Digite a resposta ideal para treinar a IA..." className="min-h-[120px] resize-none bg-muted/20 border-border" />
                  </div>
                  <Button className="h-8 px-4 w-full bg-theme-primary hover:bg-theme-primary/80 text-xs text-white font-bold rounded-md">
                    Responder
                    <Send />
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
