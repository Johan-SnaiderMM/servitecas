import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Etiqueta corta en MAYÚSCULAS (14 px: una de las pocas excepciones al texto de 16 px). */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium uppercase tracking-wider text-tinta-2", className)} {...props} />;
}
