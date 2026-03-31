import { Badge } from "@/components/ui/badge";
import { LAB_WEEKDAYS, getAllocationStatusLabel, statusToBadgeVariant } from "@/features/agendaLab/utils/presentation";
import { formatMinutesToTime, parseTimeToMinutes } from "@/features/agendaLab/utils/time";
import { cn } from "@/lib/utils";

export type WeeklyGridItem = {
  id: string;
  weekday: (typeof LAB_WEEKDAYS)[number]["key"];
  horaInicial: string;
  horaFinal: string;
  titulo: string;
  atividadeNome: string;
  salaNome: string;
  profissionalNome: string;
  ocupacaoTexto: string;
  status: "ativa" | "planejada" | "suspensa";
  hasRoomConflict?: boolean;
  hasProfessionalConflict?: boolean;
};

type WeeklyAllocationGridProps = {
  items: WeeklyGridItem[];
  onItemClick?: (item: WeeklyGridItem) => void;
  weekdays?: Array<(typeof LAB_WEEKDAYS)[number]["key"]>;
};

const DAY_START_MINUTES = 7 * 60;
const DAY_END_MINUTES = 20 * 60;
const TOTAL_DAY_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;
const GRID_HEIGHT_PX = 780;
const HOUR_MARKERS = Array.from(
  { length: TOTAL_DAY_MINUTES / 60 + 1 },
  (_, index) => DAY_START_MINUTES + index * 60
);

function getSlotColor(item: WeeklyGridItem) {
  if (item.hasRoomConflict || item.hasProfessionalConflict) {
    return "border-rose-500 bg-rose-100 text-rose-950";
  }
  if (item.status === "ativa") return "border-emerald-500 bg-emerald-100 text-emerald-950";
  if (item.status === "planejada") return "border-blue-500 bg-blue-100 text-blue-950";
  return "border-slate-500 bg-slate-200 text-slate-900";
}

export function WeeklyAllocationGrid({
  items,
  onItemClick,
  weekdays = ["seg", "ter", "qua", "qui", "sex"],
}: WeeklyAllocationGridProps) {
  const daySet = new Set(weekdays);
  const weekConfig = LAB_WEEKDAYS.filter((day) => daySet.has(day.key));

  const map = new Map<(typeof LAB_WEEKDAYS)[number]["key"], WeeklyGridItem[]>();
  for (const day of weekConfig) {
    map.set(day.key, []);
  }
  for (const item of items) {
    if (!daySet.has(item.weekday)) continue;
    map.get(item.weekday)?.push(item);
  }
  for (const day of weekConfig) {
    map.get(day.key)?.sort((a, b) => {
      const leftStart = parseTimeToMinutes(a.horaInicial) || 0;
      const rightStart = parseTimeToMinutes(b.horaInicial) || 0;
      return leftStart - rightStart;
    });
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[980px] overflow-hidden rounded-xl border border-slate-300 bg-slate-100 shadow-sm">
        <div
          className="grid border-b border-slate-300 bg-slate-200"
          style={{ gridTemplateColumns: `88px repeat(${weekConfig.length}, minmax(0, 1fr))` }}
        >
          <div className="flex items-center justify-center border-r border-slate-300 px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Hora
          </div>
          {weekConfig.map((day) => (
            <div
              key={day.key}
              className="border-r border-slate-300 px-3 py-3 text-left last:border-r-0"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{day.short}</p>
              <p className="text-sm font-semibold text-slate-800">{day.label}</p>
            </div>
          ))}
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: `88px repeat(${weekConfig.length}, minmax(0, 1fr))` }}
        >
          <div className="relative border-r border-slate-300 bg-slate-200/80" style={{ height: GRID_HEIGHT_PX }}>
            {HOUR_MARKERS.map((minute) => {
              const top = ((minute - DAY_START_MINUTES) / TOTAL_DAY_MINUTES) * GRID_HEIGHT_PX;
              return (
                <div
                  key={`hour-${minute}`}
                  className="absolute left-0 right-0 -translate-y-1/2 px-2"
                  style={{ top }}
                >
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {formatMinutesToTime(minute)}
                  </span>
                </div>
              );
            })}
          </div>

          {weekConfig.map((day) => (
            <div
              key={day.key}
              className="relative border-r border-slate-300 bg-slate-50/90 last:border-r-0"
              style={{ height: GRID_HEIGHT_PX }}
            >
              {HOUR_MARKERS.map((minute) => {
                const top = ((minute - DAY_START_MINUTES) / TOTAL_DAY_MINUTES) * GRID_HEIGHT_PX;
                return (
                  <div
                    key={`${day.key}-${minute}`}
                    className="absolute left-0 right-0 border-t border-slate-300/80"
                    style={{ top }}
                  />
                );
              })}

              {(map.get(day.key) || []).map((item) => {
                const start = parseTimeToMinutes(item.horaInicial);
                const end = parseTimeToMinutes(item.horaFinal);
                if (start === null || end === null || end <= start) return null;

                const top = ((start - DAY_START_MINUTES) / TOTAL_DAY_MINUTES) * GRID_HEIGHT_PX;
                const height = Math.max(((end - start) / TOTAL_DAY_MINUTES) * GRID_HEIGHT_PX, 94);
                const clickable = typeof onItemClick === "function";

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemClick?.(item)}
                    className={cn(
                      "absolute left-1 right-1 rounded-md border p-2 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/60",
                      getSlotColor(item),
                      !clickable && "cursor-default"
                    )}
                    style={{ top: Math.max(top, 0) + 2, height }}
                    disabled={!clickable}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-xs font-bold">{item.titulo}</p>
                      <Badge variant={statusToBadgeVariant(item.status)} className="text-[10px]">
                        {getAllocationStatusLabel(item.status)}
                      </Badge>
                    </div>
                    <p className="line-clamp-1 text-[11px] font-medium">{item.atividadeNome}</p>
                    <p className="line-clamp-1 text-[11px]">{item.salaNome}</p>
                    <p className="line-clamp-1 text-[11px]">{item.profissionalNome}</p>
                    <div className="mt-1 flex items-center justify-between text-[10px] font-medium">
                      <span>{item.ocupacaoTexto}</span>
                      <span>
                        {item.horaInicial} - {item.horaFinal}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

