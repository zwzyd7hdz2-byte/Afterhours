import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

let client;
let pollTimer = null;
let activeRoom = null;
let pollCallback = null;
let errorCallback = null;
let pollInFlight = false;
let lastPollAt = 0;
const POLL_INTERVAL_MS = 900;

export function isSupabaseConfigured() {
  return SUPABASE_URL.startsWith("https://") &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_URL.includes("PASTE_") &&
    !SUPABASE_ANON_KEY.includes("PASTE_");
}
function getClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase connection details have not been added yet.");
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
async function rpc(name, args = {}) {
  const { data, error } = await getClient().rpc(name, args);
  if (error) throw error;
  return data;
}
export async function createRoom() {
  const result = await rpc("ah_create_room");
  activeRoom = { code: result.room_code, token: result.player_token, player: 1 };
  localStorage.setItem("afterhours_room", JSON.stringify(activeRoom));
  return result;
}
export async function joinRoom(code) {
  const result = await rpc("ah_join_room", { p_room_code: code.trim().toUpperCase() });
  activeRoom = { code: result.room_code, token: result.player_token, player: 2 };
  localStorage.setItem("afterhours_room", JSON.stringify(activeRoom));
  return result;
}
export function getSavedRoom() {
  try {
    activeRoom = JSON.parse(localStorage.getItem("afterhours_room") || "null");
    return activeRoom;
  } catch { return null; }
}
export async function getRoom() {
  if (!activeRoom) activeRoom = getSavedRoom();
  if (!activeRoom) throw new Error("No room session found on this device.");
  return rpc("ah_get_room", {
    p_room_code: activeRoom.code,
    p_player_token: activeRoom.token
  });
}
export async function updateRoomState(state) {
  if (!activeRoom) activeRoom = getSavedRoom();
  if (!activeRoom) throw new Error("No room session found on this device.");
  const result = await rpc("ah_update_room", {
    p_room_code: activeRoom.code,
    p_player_token: activeRoom.token,
    p_room_state: state
  });
  // Fetch the confirmed server state immediately after a write.
  requestRoomRefresh();
  return result;
}
export function stopRoomPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  pollCallback = null;
  errorCallback = null;
  pollInFlight = false;
}

export function clearRoom() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  pollCallback = null;
  errorCallback = null;
  activeRoom = null;
  localStorage.removeItem("afterhours_room");
}

async function runRoomPoll() {
  if (pollInFlight || !pollCallback) return;
  pollInFlight = true;
  lastPollAt = Date.now();
  try {
    const room = await getRoom();
    pollCallback?.(room);
  } catch (error) {
    errorCallback?.(error);
  } finally {
    pollInFlight = false;
    scheduleNextPoll();
  }
}

function scheduleNextPoll(delay = POLL_INTERVAL_MS) {
  if (pollTimer) clearTimeout(pollTimer);
  if (!pollCallback) return;
  pollTimer = setTimeout(runRoomPoll, delay);
}

function requestRoomRefresh() {
  if (!pollCallback || pollInFlight) return;
  scheduleNextPoll(0);
}

export function startRoomPolling(onUpdate, onError) {
  if (pollTimer) clearTimeout(pollTimer);
  pollCallback = onUpdate;
  errorCallback = onError;
  pollInFlight = false;
  runRoomPoll();
}

// Background tabs can have throttled timers. Refresh as soon as the player
// returns to the tab, without allowing overlapping RPC requests.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && pollCallback && !pollInFlight) {
    scheduleNextPoll(0);
  }
});
window.addEventListener("focus", () => {
  if (pollCallback && !pollInFlight) scheduleNextPoll(0);
});
