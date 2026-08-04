/**
 * 오디오 큐 라우터 — D+9 범위 배관 (툴링 소유, 판정 시간 소유 없음).
 *
 * D+9 연결점 [소회의(11) 분담표 — 사운드 세트는 이준호 상대 마감(패턴 확정+4일)]:
 *  - aimEnter / aimExit        조준경 진입·해제음 ← aimModeChanged (계약 존재 — 지금 구독)
 *  - creditsGained             크레딧 획득음      ← 경제 이벤트 (계약 제안 중 — INT-TOOL-007)
 *  - rarePartAcquired          희귀 부품 획득음   ← 〃
 *  - baseEnter / baseDepart    기지 진입·출항 전환음 ← 메타 루프 이벤트 (〃)
 *
 * 보스 전용 음악·침묵 전환: **배관만 준비** — musicBus와 setMusicSilenced()를
 * 제공하고, 단계 전환 판정(보스 상태 머신)은 리드 소유. 침묵 2초의 타이밍
 * 주인도 판정 측이다 (폭뢰 3초 원칙과 동일한 책임 경계).
 *
 * 사운드 에셋이 아직 없으므로 버퍼 미등록 큐는 무음 + 개발 모드 1회 로그다 —
 * 배선이 먼저, 소리는 등록 시 즉시 활성.
 */

import type { EventBus, Unsubscribe } from '../core/EventBus';
import { WebAudioSystem } from './WebAudioSystem';

export type AudioCueId =
  | 'aimEnter'
  | 'aimExit'
  | 'creditsGained'
  | 'rarePartAcquired'
  | 'baseEnter'
  | 'baseDepart'
  /** 폭뢰 입수 '풍덩' — 시그니처 리듬의 시작점 */
  | 'depthChargeSplash'
  /** 폭뢰 폭발 */
  | 'depthChargeExplosion';

export class AudioCueRouter {
  private readonly buffers = new Map<AudioCueId, AudioBuffer>();
  private readonly warnedMissing = new Set<AudioCueId>();
  private readonly unsubscribers: Unsubscribe[] = [];
  /** 테스트 주입용 — 실제 재생 대신 트리거만 관찰 */
  private readonly sink: ((cue: AudioCueId) => void) | null;
  // 생성자 매개변수 프로퍼티 미사용 — 검증 러너(run.mjs)의 Node 타입
  // 스트리핑 호환(삭제 가능 문법만)을 위해 명시적 필드로 둔다.
  private readonly audio: WebAudioSystem;

  constructor(audio: WebAudioSystem, bus: EventBus, sink?: (cue: AudioCueId) => void) {
    this.audio = audio;
    this.sink = sink ?? null;
    // 계약이 이미 존재하는 연결점은 지금 구독한다
    this.unsubscribers.push(
      bus.on('aimModeChanged', ({ aiming }) => {
        this.trigger(aiming ? 'aimEnter' : 'aimExit');
      }),
    );
    // 폭뢰 lifecycle — 판정이 발행하는 **같은 이벤트**를 사운드가 소비한다.
    // 별도 타이머를 두지 않는 이유: '풍덩→3초→폭발' 리듬의 주인은 판정이며
    // (마스터 플랜 §5.12), 사운드가 자체 시계를 돌리면 둘이 어긋난다.
    this.unsubscribers.push(
      bus.on('depthChargeEnteredWater', () => {
        this.trigger('depthChargeSplash');
      }),
    );
    this.unsubscribers.push(
      bus.on('depthChargeExploded', () => {
        this.trigger('depthChargeExplosion');
      }),
    );
    // creditsGained·rarePartAcquired·기지 전환 이벤트는 계약 부재 —
    // INT-TOOL-007 승인 시 여기서 구독을 추가한다 (trigger는 공개 API로 준비됨).
  }

  /** 사운드 세트 수신(D+10 상대 마감) 시 큐별 버퍼 등록 */
  registerBuffer(cue: AudioCueId, buffer: AudioBuffer): void {
    this.buffers.set(cue, buffer);
  }

  /** 큐 재생 요청 — 버퍼 미등록이면 무음(개발 모드 1회 로그). 던지지 않는다 */
  trigger(cue: AudioCueId): void {
    if (this.sink) {
      this.sink(cue);
      return;
    }
    const buffer = this.buffers.get(cue);
    if (!buffer) {
      // import.meta.env는 Vite 전용 — Node 검증 러너에서는 undefined (옵셔널 접근)
      if (import.meta.env?.DEV && !this.warnedMissing.has(cue)) {
        this.warnedMissing.add(cue);
        console.debug(`[AudioCueRouter] 큐 '${cue}' — 버퍼 미등록(사운드 세트 대기), 무음 진행.`);
      }
      return;
    }
    this.audio.playBuffer(buffer);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.buffers.clear();
  }
}
