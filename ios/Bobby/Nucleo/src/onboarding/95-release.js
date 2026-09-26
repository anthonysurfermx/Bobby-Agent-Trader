/* Release-only no-ops for the dev harness hooks used by the live engine. */
var SEEKING = false, paused = false, frozen = false;
function beatPost(){}
function harnessOn(){}
function signal(){}
function renderGhost(){}
function togglePause(){ paused = !paused; }
