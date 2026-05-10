import { Controls as VControls } from "@vidstack/react";

type Props = {
  title: string;
};

export function TitleBar({ title }: Props) {
  return (
    <VControls.Root className="pointer-events-none absolute inset-x-0 top-0 z-20 opacity-0 transition-opacity duration-200 ease-out data-[visible]:opacity-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/85 via-black/40 to-transparent" />
      <VControls.Group className="pointer-events-auto relative px-4 pt-3 sm:px-5 sm:pt-4">
        <h2 className="line-clamp-1 font-mono text-sm font-medium text-white/90 sm:text-base" title={title}>
          {title}
        </h2>
      </VControls.Group>
    </VControls.Root>
  );
}
