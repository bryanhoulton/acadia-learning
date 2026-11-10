/**
 * Renderer - Handles all canvas rendering
 */

import type { ViewportState, TrackPosition } from './types';
import type { BezierTrack } from './Track';
import type { Car } from './Car';
import { RENDER_CONFIG } from './config';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;

  constructor(canvas: HTMLCanvasElement, minimapCanvas?: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    if (minimapCanvas) {
      this.minimapCanvas = minimapCanvas;
      this.minimapCtx = minimapCanvas.getContext('2d');
    }
  }

  /**
   * Set minimap canvas (can be done after construction)
   */
  setMinimapCanvas(minimapCanvas: HTMLCanvasElement): void {
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d');
  }

  /**
   * Resize canvases to fit viewport
   */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;

    if (this.minimapCanvas) {
      this.minimapCanvas.width = 200;
      this.minimapCanvas.height = 140;
    }
  }

  /**
   * Clear and render the entire scene
   */
  render(viewport: ViewportState, track: BezierTrack | null, cars: Car[]): void {
    this.renderMain(viewport, track, cars);
    if (this.minimapCanvas && this.minimapCtx) {
      this.renderMinimap(viewport, track, cars);
    }
  }

  /**
   * Render main viewport
   */
  private renderMain(viewport: ViewportState, track: BezierTrack | null, cars: Car[]): void {
    const ctx = this.ctx;
    const { width, height, x, y, zoom } = viewport;

    // Clear
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, width, height);

    // Save and transform
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-x, -y);

    // Draw grass background
    ctx.fillStyle = RENDER_CONFIG.grassColor;
    ctx.fillRect(-2000, -2000, 4000, 4000);

    // Draw track
    if (track) {
      this.renderTrack(ctx, track);
    }

    // Draw cars
    cars.forEach((car) => this.renderCar(ctx, car, track));

    ctx.restore();
  }

  /**
   * Render track on context
   */
  private renderTrack(ctx: CanvasRenderingContext2D, track: BezierTrack): void {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer edge (red barrier)
    ctx.strokeStyle = RENDER_CONFIG.edgeColor;
    ctx.lineWidth = track.width + 6;
    track.drawPath(ctx);
    ctx.stroke();

    // Asphalt surface
    ctx.strokeStyle = RENDER_CONFIG.asphaltColor;
    ctx.lineWidth = track.width;
    track.drawPath(ctx);
    ctx.stroke();

    // Lane markings
    ctx.strokeStyle = RENDER_CONFIG.laneMarkingColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 20]);

    [-1, 0, 1].forEach((lane) => {
      ctx.beginPath();
      track.points.forEach((p, i) => {
        const perpAngle = p.angle + Math.PI / 2;
        const px = p.x + Math.cos(perpAngle) * lane * (track.width / 3);
        const py = p.y + Math.sin(perpAngle) * lane * (track.width / 3);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
    });

    ctx.setLineDash([]);

    // Start/finish line
    this.renderStartFinishLine(ctx, track);
  }

  /**
   * Render start/finish line
   */
  private renderStartFinishLine(ctx: CanvasRenderingContext2D, track: BezierTrack): void {
    const startPoint = track.points[0];
    const perpAngle = startPoint.angle + Math.PI / 2;
    const hw = track.width / 2;

    // White line
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(
      startPoint.x + Math.cos(perpAngle) * hw,
      startPoint.y + Math.sin(perpAngle) * hw
    );
    ctx.lineTo(
      startPoint.x - Math.cos(perpAngle) * hw,
      startPoint.y - Math.sin(perpAngle) * hw
    );
    ctx.stroke();

    // Checkered pattern
    const checkerSize = 10;
    for (let i = -4; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        if ((i + j) % 2 === 0) continue;
        ctx.fillStyle = 'black';
        const cx = startPoint.x + Math.cos(perpAngle) * i * checkerSize;
        const cy = startPoint.y + Math.sin(perpAngle) * i * checkerSize;
        const dx = Math.cos(startPoint.angle) * checkerSize * (j - 0.5);
        const dy = Math.sin(startPoint.angle) * checkerSize * (j - 0.5);
        ctx.fillRect(cx + dx - checkerSize / 2, cy + dy - checkerSize / 2, checkerSize, checkerSize);
      }
    }
  }

  /**
   * Render a single car
   */
  private renderCar(ctx: CanvasRenderingContext2D, car: Car, track: BezierTrack | null): void {
    if (!track) return;

    const pos = track.getPosition(car.trackProgress, car.laneOffset);
    const { carLength, carWidth } = RENDER_CONFIG;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(pos.angle);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(-carLength / 2 + 3, -carWidth / 2 + 3, carLength, carWidth, 5);
    ctx.fill();

    // Body
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-carLength / 2, -carWidth / 2, carLength, carWidth, 5);
    ctx.fill();

    // Front nose highlight (indicates direction)
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.roundRect(carLength / 2 - 8, -carWidth / 2 + 2, 6, carWidth - 4, 3);
    ctx.fill();

    // User highlight
    if (car.isUser) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-carLength / 2, -carWidth / 2, carLength, carWidth, 5);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(car.isUser ? '★' : car.name.charAt(0), -2, 0);

    ctx.restore();

    // Speed lines when fast
    if (car.velocity > RENDER_CONFIG.speedLineThreshold) {
      this.renderSpeedLines(ctx, pos, car.velocity, carLength);
    }
  }

  /**
   * Render speed lines behind fast-moving car
   */
  private renderSpeedLines(
    ctx: CanvasRenderingContext2D,
    pos: TrackPosition,
    velocity: number,
    carLength: number
  ): void {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(pos.angle);
    ctx.strokeStyle = `rgba(255,255,255,${((velocity - 100) / 100) * 0.3})`;
    ctx.lineWidth = 2;

    for (let i = 0; i < 3; i++) {
      const y = (i - 1) * 6;
      ctx.beginPath();
      ctx.moveTo(-carLength / 2 - 5, y);
      ctx.lineTo(-carLength / 2 - 20 - Math.random() * 10, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Render minimap
   */
  private renderMinimap(viewport: ViewportState, track: BezierTrack | null, cars: Car[]): void {
    if (!this.minimapCanvas || !this.minimapCtx) return;

    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, w, h);

    if (!track) return;

    // Calculate scale to fit track
    const bounds = track.getBounds();
    const scale = Math.min(
      (w - 20) / (bounds.maxX - bounds.minX),
      (h - 20) / (bounds.maxY - bounds.minY)
    );

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(bounds.minX + bounds.maxX) / 2, -(bounds.minY + bounds.maxY) / 2);

    // Draw track (simplified)
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = track.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    track.drawPath(ctx);
    ctx.stroke();

    // Draw cars as dots
    cars.forEach((car) => {
      const pos = track.getPosition(car.trackProgress, car.laneOffset);
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fill();

      if (car.isUser) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw viewport rectangle
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2 / scale;
    const vpW = viewport.width / viewport.zoom;
    const vpH = viewport.height / viewport.zoom;
    ctx.strokeRect(viewport.x - vpW / 2, viewport.y - vpH / 2, vpW, vpH);

    ctx.restore();
  }
}
