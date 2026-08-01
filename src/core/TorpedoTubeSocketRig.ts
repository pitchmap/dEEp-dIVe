/**
 * 선수 발사관 소켓 rig — `TorpedoTubeSocketSource` 계약의 단일 구현 (리드 소유).
 *
 * 그래픽스(조준 카메라)와 게임플레이(어뢰 생성)가 **같은 인스턴스**를
 * composition root에서 주입받아 소비한다. 두 소켓의 전방축은 항상 동일하며
 * (십자선 = 탄도, 7차 결의 1-④), 방향은 conventions.aimForwardDirection
 * 한 함수에서만 나온다. 안전 오프셋은 world/torpedoTubeAnchor 정의 하나뿐.
 *
 * 미세 조준각(FineAimSource)은 게임플레이 조준 시스템이 공급한다 — 미연결
 * 상태(스프린트 A 게임플레이 창 합류 전)에서는 미세각 0으로 동작하며, 이는
 * '조준 해제 시 reset(0)' 계약의 기준 상태와 같다 (더미 상태 소스 아님 —
 * 포즈는 실제 게임플레이 상태다).
 *
 * 주의: 생성자 매개변수 프로퍼티 미사용 — 검증 러너(run.mjs)가 Node 타입
 * 스트리핑으로 직접 로드한다 (src/meta·systems와 동일 규칙).
 */

import type {
  FineAimSource,
  SocketPose,
  SubmarinePoseSource,
  TorpedoTubeSocketSource,
} from '../contracts/systems';
import { TORPEDO_TUBE_ANCHOR } from '../world/torpedoTubeAnchor';
import { aimForwardDirection } from './conventions';

export class TorpedoTubeSocketRig implements TorpedoTubeSocketSource {
  private readonly pose: SubmarinePoseSource;
  private fineAim: FineAimSource | null;

  constructor(pose: SubmarinePoseSource, fineAim: FineAimSource | null = null) {
    this.pose = pose;
    this.fineAim = fineAim;
  }

  /** 게임플레이 조준 시스템(FineAimSource 구현) 합류 시 composition root가 1회 연결 */
  attachFineAimSource(source: FineAimSource): void {
    this.fineAim = source;
  }

  /** 조준 카메라 소켓 — 앵커 정위치 (7차 결의 1-②) */
  get aimCameraSocket(): SocketPose {
    return this.computeSocket(0);
  }

  /** 어뢰 생성 소켓 — 동일 전방축 + 고정 안전 오프셋 (13차 결의 2) */
  get torpedoSpawnSocket(): SocketPose {
    return this.computeSocket(TORPEDO_TUBE_ANCHOR.spawnForwardSafetyOffsetMeters);
  }

  private computeSocket(forwardOffsetMeters: number): SocketPose {
    const heading = this.pose.headingRadians;
    const aimYaw = this.fineAim?.aimYawRadians ?? 0;
    const aimPitch = this.fineAim?.aimPitchRadians ?? 0;
    // 두 소켓이 공유하는 유일한 전방축 — 시선 = 탄도
    const forward = aimForwardDirection(heading, aimYaw, aimPitch);

    // 앵커 로컬 → 월드 (Y축 heading 회전 — mesh.rotation.y 규약과 동일)
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const anchorWorldX =
      this.pose.positionX + TORPEDO_TUBE_ANCHOR.localX * cos + TORPEDO_TUBE_ANCHOR.localZ * sin;
    const anchorWorldY = this.pose.positionY + TORPEDO_TUBE_ANCHOR.localY;
    const anchorWorldZ =
      this.pose.positionZ - TORPEDO_TUBE_ANCHOR.localX * sin + TORPEDO_TUBE_ANCHOR.localZ * cos;

    return {
      positionX: anchorWorldX + forward.x * forwardOffsetMeters,
      positionY: anchorWorldY + forward.y * forwardOffsetMeters,
      positionZ: anchorWorldZ + forward.z * forwardOffsetMeters,
      forwardX: forward.x,
      forwardY: forward.y,
      forwardZ: forward.z,
    };
  }
}
