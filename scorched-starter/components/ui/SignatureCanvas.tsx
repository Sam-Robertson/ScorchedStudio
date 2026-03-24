"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface SignatureCanvasRef {
  getData: () => string | null; // base64 PNG, or null if empty
  isEmpty: () => boolean;
  clear: () => void;
}

const SignatureCanvas = forwardRef<
  SignatureCanvasRef,
  { className?: string; onDraw?: () => void }
>(function SignatureCanvas({ className, onDraw }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const [, setTick] = useState(0); // used only to trigger re-renders for isEmpty UI

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
    hasDrawn.current = false;
    setTick((t) => t + 1);
  };

  useEffect(() => {
    initCanvas();
    window.addEventListener("resize", initCanvas);
    return () => window.removeEventListener("resize", initCanvas);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    getData: () =>
      hasDrawn.current
        ? (canvasRef.current?.toDataURL("image/png") ?? null)
        : null,
    isEmpty: () => !hasDrawn.current,
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;
      ctx.clearRect(
        0,
        0,
        canvas.width / (window.devicePixelRatio || 1),
        canvas.height / (window.devicePixelRatio || 1)
      );
      hasDrawn.current = false;
      setTick((t) => t + 1);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const src =
        "touches" in e
          ? (e as TouchEvent).touches[0] || (e as TouchEvent).changedTouches[0]
          : (e as MouseEvent);
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    };

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing.current = true;
      const { x, y } = pos(e);
      ctxRef.current?.beginPath();
      ctxRef.current?.moveTo(x, y);
    };

    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const { x, y } = pos(e);
      ctxRef.current?.lineTo(x, y);
      ctxRef.current?.stroke();
      if (!hasDrawn.current) {
        hasDrawn.current = true;
        setTick((t) => t + 1);
        onDraw?.();
      }
    };

    const end = () => {
      drawing.current = false;
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, [onDraw]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: "none" }}
      aria-label="Signature pad — draw your signature here"
    />
  );
});

export default SignatureCanvas;
