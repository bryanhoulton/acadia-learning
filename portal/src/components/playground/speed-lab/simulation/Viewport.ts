/**
 * Viewport Controller - Handles pan, zoom, and camera following
 */

import type { ViewportState } from './types';
import type { Car } from './Car';
import type { BezierTrack } from './Track';
import { VIEWPORT_CONFIG } from './config';

export class Viewport {
  // Viewport state
  public x: number = 0;
  public y: number = 0;
  public zoom: number = 1;
  public width: number = 0;
  public height: number = 0;
  public followingCar: string | null = VIEWPORT_CONFIG.defaultFollowCar;

  // Input state
  private isDragging: boolean = false;
  private lastMousePos: { x: number; y: number } = { x: 0, y: 0 };

  // Callbacks
  public onUpdate: (() => void) | null = null;

  // Container element (for size)
  private container: HTMLElement | null = null;

  // Bound event handlers (for cleanup)
  private boundOnMouseDown: (e: MouseEvent) => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseUp: () => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundOnResize: () => void;

  constructor() {
    // Bind event handlers
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnResize = this.resize.bind(this);
  }

  /**
   * Attach to a container element and setup event listeners
   */
  attach(container: HTMLElement): void {
    this.container = container;
    this.setupEventListeners();
    this.resize();
  }

  /**
   * Detach from container and cleanup event listeners
   */
  detach(): void {
    if (this.container) {
      this.container.removeEventListener('mousedown', this.boundOnMouseDown);
      this.container.removeEventListener('mousemove', this.boundOnMouseMove);
      this.container.removeEventListener('mouseup', this.boundOnMouseUp);
      this.container.removeEventListener('mouseleave', this.boundOnMouseUp);
      this.container.removeEventListener('wheel', this.boundOnWheel);
    }
    window.removeEventListener('resize', this.boundOnResize);
    this.container = null;
  }

  /**
   * Setup mouse event listeners for panning and zooming
   */
  private setupEventListeners(): void {
    if (!this.container) return;

    this.container.addEventListener('mousedown', this.boundOnMouseDown);
    this.container.addEventListener('mousemove', this.boundOnMouseMove);
    this.container.addEventListener('mouseup', this.boundOnMouseUp);
    this.container.addEventListener('mouseleave', this.boundOnMouseUp);
    this.container.addEventListener('wheel', this.boundOnWheel, { passive: false });

    window.addEventListener('resize', this.boundOnResize);
  }

  /**
   * Resize viewport to container dimensions
   */
  resize(): void {
    if (!this.container) return;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.onUpdate?.();
  }

  /**
   * Handle mouse down - start panning
   */
  private onMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.lastMousePos = { x: e.clientX, y: e.clientY };
    this.followingCar = null; // Stop following when user pans
    this.onUpdate?.();
  }

  /**
   * Handle mouse move - pan viewport
   */
  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastMousePos.x;
    const dy = e.clientY - this.lastMousePos.y;

    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;

    this.lastMousePos = { x: e.clientX, y: e.clientY };
    this.onUpdate?.();
  }

  /**
   * Handle mouse up - stop panning
   */
  private onMouseUp(): void {
    this.isDragging = false;
  }

  /**
   * Handle mouse wheel - zoom
   */
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom = Math.max(
      VIEWPORT_CONFIG.minZoom,
      Math.min(VIEWPORT_CONFIG.maxZoom, this.zoom * zoomFactor)
    );
    this.onUpdate?.();
  }

  /**
   * Zoom in
   */
  zoomIn(): void {
    this.zoom = Math.min(VIEWPORT_CONFIG.maxZoom, this.zoom * VIEWPORT_CONFIG.zoomStep);
    this.onUpdate?.();
  }

  /**
   * Zoom out
   */
  zoomOut(): void {
    this.zoom = Math.max(VIEWPORT_CONFIG.minZoom, this.zoom / VIEWPORT_CONFIG.zoomStep);
    this.onUpdate?.();
  }

  /**
   * Reset viewport to default (stops following)
   */
  reset(): void {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.followingCar = null;
    this.onUpdate?.();
  }

  /**
   * Toggle following the user car
   */
  toggleFollow(): void {
    if (this.followingCar) {
      this.followingCar = null;
      this.zoom = 1; // Reset to default zoom when not following
    } else {
      this.followingCar = 'user';
      this.zoom = VIEWPORT_CONFIG.followZoom; // Closer zoom when following
    }
    this.onUpdate?.();
  }

  /**
   * Set follow target and optionally center on car immediately
   */
  setFollowTarget(carId: string | null, car: Car | null = null, track: BezierTrack | null = null): void {
    this.followingCar = carId;

    // Set follow zoom level (20% closer)
    if (carId) {
      this.zoom = VIEWPORT_CONFIG.followZoom;
    }

    // If car and track provided, center on car immediately
    if (car && track) {
      this.centerOnCar(car, track);
    }
  }

  /**
   * Center viewport on a car's position
   */
  centerOnCar(car: Car, track: BezierTrack): void {
    if (!car || !track) return;

    const pos = track.getPosition(car.trackProgress, car.laneOffset);
    this.x = pos.x;
    this.y = pos.y;
  }

  /**
   * Update viewport to follow a car (called every frame)
   */
  followCar(car: Car, track: BezierTrack): void {
    if (!this.followingCar || !car || !track) return;
    this.centerOnCar(car, track);
  }

  /**
   * Check if currently following
   */
  isFollowing(): boolean {
    return !!this.followingCar;
  }

  /**
   * Get viewport state for rendering
   */
  getState(): ViewportState {
    return {
      x: this.x,
      y: this.y,
      zoom: this.zoom,
      width: this.width,
      height: this.height,
    };
  }
}
