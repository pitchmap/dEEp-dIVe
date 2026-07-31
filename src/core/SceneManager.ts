/**
 * 장면 관리 — 활성 장면 하나의 수명 주기만 담당한다.
 *
 * core는 장면의 내용(Three.js 오브젝트 구성)을 알지 못한다.
 * 장면 구현은 그래픽스 소유 영역(src/render)이다.
 */

export interface ManagedScene {
  update(deltaSeconds: number): void;
  render(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export class SceneManager {
  private active: ManagedScene | null = null;

  setActive(scene: ManagedScene): void {
    if (this.active) {
      this.active.dispose();
    }
    this.active = scene;
  }

  update(deltaSeconds: number): void {
    this.active?.update(deltaSeconds);
  }

  render(): void {
    this.active?.render();
  }

  resize(width: number, height: number): void {
    this.active?.resize(width, height);
  }

  dispose(): void {
    this.active?.dispose();
    this.active = null;
  }
}
