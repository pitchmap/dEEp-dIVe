/**
 * Web Audio API 최소 배관 — AudioSystem 계약(src/contracts/systems.ts) 구현.
 *
 * 이 파일의 범위 [단계 0]:
 *  - AudioContext 생성·unlock (브라우저 자동재생 정책 대응)
 *  - 기본 버스: 마스터 GainNode → destination
 *  - 패너 연결 구조: PannerNode → 마스터 버스, 리스너 자세는 카메라 기준 [확정]
 *
 * 여기 없는 것 (책임 경계 — src/audio/README.md):
 *  - 폭뢰 '풍덩→3초→폭발'의 3초 타이머·피해 판정 — 판정 로직(게임플레이)이
 *    시간의 주인이다. 오디오는 이벤트에 동기화만 한다 (D3 이후 작업).
 *  - 사운드 에셋 로드·재생 — 사운드 세트는 D+10 산출물.
 */

import type { AudioSystem } from '../contracts/systems';

export class WebAudioSystem implements AudioSystem {
  private context: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private isUnlocked = false;

  /** 사용자 제스처 후 unlock()이 성공했는가 */
  get unlocked(): boolean {
    return this.isUnlocked;
  }

  /**
   * 사용자 제스처 핸들러 안에서 호출한다. 실패해도 던지지 않는다 —
   * 무음으로 진행하고 다음 제스처에서 재시도할 수 있다 (계약의 오류 처리 규칙).
   */
  async unlock(): Promise<void> {
    try {
      const context = this.ensureContext();
      if (context.state !== 'running') {
        await context.resume();
      }
      this.isUnlocked = context.state === 'running';
    } catch (error) {
      this.isUnlocked = false;
      console.warn('[WebAudioSystem] unlock 실패 — 무음 진행, 다음 제스처에서 재시도.', error);
    }
  }

  /**
   * 3D 음원용 패너를 만들어 마스터 버스에 연결해 반환한다.
   * 음원(소나 핑·폭뢰 입수음 등)은 D3 이후 이 패너 앞단에 연결된다.
   */
  createPanner(x: number, y: number, z: number): PannerNode {
    const context = this.ensureContext();
    const panner = new PannerNode(context, {
      panningModel: 'equalpower', // 저사양 우선 — HRTF는 비용 대비 이득 없음 (§12)
      distanceModel: 'linear',
      positionX: x,
      positionY: y,
      positionZ: z,
    });
    panner.connect(this.ensureMasterBus());
    return panner;
  }

  /**
   * 리스너 자세 갱신 — 패닝 기준은 항상 카메라 [확정, §3.2].
   * 카메라 소유 파트가 프레임마다 카메라 위치·방향으로 호출한다.
   */
  setListenerPose(
    posX: number,
    posY: number,
    posZ: number,
    forwardX: number,
    forwardY: number,
    forwardZ: number,
    upX: number,
    upY: number,
    upZ: number,
  ): void {
    if (!this.context) return; // unlock 전에는 갱신할 리스너가 없다
    const listener = this.context.listener;
    listener.positionX.value = posX;
    listener.positionY.value = posY;
    listener.positionZ.value = posZ;
    listener.forwardX.value = forwardX;
    listener.forwardY.value = forwardY;
    listener.forwardZ.value = forwardZ;
    listener.upX.value = upX;
    listener.upY.value = upY;
    listener.upZ.value = upZ;
  }

  update(_deltaSeconds: number): void {
    // 단계 0에는 프레임 단위 작업이 없다 — 계약(Updatable)상의 호출 지점만 유지.
  }

  dispose(): void {
    this.masterBus?.disconnect();
    this.masterBus = null;
    void this.context?.close();
    this.context = null;
    this.isUnlocked = false;
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      // 자동재생 정책 때문에 suspended 상태로 만들어질 수 있다 — unlock에서 resume.
      this.context = new AudioContext();
    }
    return this.context;
  }

  private ensureMasterBus(): GainNode {
    if (!this.masterBus) {
      this.masterBus = new GainNode(this.ensureContext(), { gain: 1 });
      this.masterBus.connect(this.ensureContext().destination);
    }
    return this.masterBus;
  }
}
