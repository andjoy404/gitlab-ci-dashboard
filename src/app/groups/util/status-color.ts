import { Status } from '$groups/model/status'

type Color = string

const dark6 = '#25262B'
const colorMap = new Map<Status | string, Color>([
  [Status.CREATED, '#39A0FF'],
  [Status.WAITING_FOR_RESOURCE, '#9AA3AD'],
  [Status.PREPARING, '#39A0FF'],
  [Status.PENDING, '#39A0FF'],
  [Status.RUNNING, '#39A0FF'],
  [Status.SUCCESS, '#18D99A'],
  [Status.FAILED, '#FF5267'],
  [Status.CANCELED, '#FF8291'],
  [Status.SKIPPED, '#FF9F2F'],
  [Status.MANUAL, '#FFC21C'],
  [Status.SCHEDULED, '#A970FF'],
  [Status.FAILED_ALLOW_FAILURE, '#FFC21C']
])

export function statusToColor(status?: Status | string): Color {
  return status ? colorMap.get(status) || dark6 : dark6
}
