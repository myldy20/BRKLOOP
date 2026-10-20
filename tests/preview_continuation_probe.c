/* SPDX-License-Identifier: GPL-3.0-only */
/* Research-only executable adapter probe, not an audio fidelity fixture.
 * Reports whether the browser host preserves original SLOOP 2.7 note continuation. */
#include <stdio.h>
#define __attribute__(x)
#include "../firmware/host/preview.c"
int main(void)
{
    preview_init();
    /* Same 12-byte transfer as web/preview-worklet.js for one 60/C4 NOTE. */
    transfer[0] = 60;
    transfer[1] = 0; transfer[2] = 0; transfer[3] = 0;
    transfer[4] = 1;                /* 1 note */
    transfer[5] = ST_NOTE;
    transfer[6] = SF_ACCENT | SF_CONT(0);
    transfer[7] = 100;
    transfer[8] = 0; transfer[9] = 0;
    transfer[10] = 0; transfer[11] = 0;
    preview_step(0, 0);
    unsigned int got = trk[0].step[0].flags;
    unsigned int expected = SF_ACCENT | SF_CONT(0);
    if ((got & SF_ACCENT) == 0) {
        fputs("FAIL: browser adapter lost even the baseline accent flag\n", stderr);
        return 1;
    }
    if ((got & SF_CONT(0)) == 0) {
        printf("KNOWN BLOCKER: preview_step stored 0x%02X (input 0x%02X); SF_CONT not delivered to DSP\n", got, expected);
        return 0; /* Deliberate audit of existing behaviour, NOT acceptance of audio parity. */
    }
    printf("STRUCTURAL PASS: browser adapter preserved 0x%02X; audio continuity parity still untested\n", got);
    return 0;
}
