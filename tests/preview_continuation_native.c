/* SPDX-License-Identifier: GPL-3.0-only
 * Real compiled firmware browser adapter. Dedicated polyphonic step fixture.
 * Stdin: engine/preset/frames, P_COUNT track params, G_COUNT global params,
 * then two canonical 12-byte browser step packets. Stdout: interleaved float32.
 */
#include <stdio.h>
#define __attribute__(x)
#include "../firmware/host/preview.c"
int main(void)
{
    int32_t c[3 + P_COUNT + G_COUNT];
    uint8_t packets[2][12];
    if (fread(c, sizeof c, 1, stdin) != 1 ||
        fread(packets, sizeof packets, 1, stdin) != 1) return 2;
    if (c[0] != 0 || c[2] < CTL || c[2] % CTL) return 3;
    preview_init();
    preview_render(); /* Match the AudioWorklet's constructor warmup. */
    preview_track(0, (uint32_t)c[0], (uint32_t)c[1]);
    for (uint32_t i=0;i<P_COUNT;i++) preview_param(0,i,c[3+i]);
    for (uint32_t i=0;i<G_COUNT;i++) preview_global(i,c[3+P_COUNT+i]);
    for (uint32_t k=1;k<NTRK;k++) preview_param(k,P_MUTE,1);
    for (uint32_t i=0;i<2;i++){
        memcpy(transfer,packets[i],12);
        preview_step(0,i);
    }
    /* Expected SLOOP 2.7 flag must survive browser host interpretation.
     * Do not silently accept audio comparison if the host drops SF_CONT. */
    if (!(trk[0].step[1].flags & SF_CONT(0))) {
        fprintf(stderr,"Browser host lost SF_CONT0: 0x%02x\n",trk[0].step[1].flags);
        return 4;
    }
    preview_play(1);
    for (int32_t i=0;i<c[2];i+=CTL)
        if (fwrite(preview_render(),sizeof output,1,stdout)!=1)return 5;
    return 0;
}
