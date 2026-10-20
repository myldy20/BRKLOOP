/* SPDX-License-Identifier: GPL-3.0-only
 * Research-only: export the actual compiled SLOOP factory preset structs.
 * Mirrors the pure parameter transformations from ui.c::apply_preset_to,
 * excluding LIVE ARP preservation (starting from reset defaults).
 * This is NOT imported into firmware, website or the official bank builder.
 */
#include <stdio.h>
#define __attribute__(x)
#include "../firmware/host/preview.c"

static void emit_string(const char *s) {
    putchar('"');
    for (;s && *s;s++) {
        unsigned char ch=(unsigned char)*s;
        if(ch=='"'||ch=='\\') {putchar('\\');putchar(ch);}
        else if(ch<32)printf("\\u%04x",(unsigned)ch);
        else putchar(ch);
    }
    putchar('"');
}
static void snapshot_preset(uint32_t ei,uint32_t pi,int16_t *p) {
    const preset_t *pr=&ENGINES[ei]->presets[pi];
    static const uint8_t fx_def[4]={0,24,28,36};
    for(uint32_t i=0;i<P_COUNT;i++)p[i]=TP[i].def;
    for(uint32_t i=0;i<8;i++)p[P_E0+i]=(int16_t)pr->e[i];
    p[P_ATK]=pr->env[0];p[P_DEC]=pr->env[1];
    p[P_SUS]=pr->env[2];p[P_REL]=pr->env[3];
    p[P_ED_FLT]=pr->fenv;
    p[P_ED_FX]=preset_trim(ei,pi);
    p[P_VOICE]=pr->mono?V_LEGATO:V_POLY;
    for(uint32_t i=0;i<4;i++){
        p[P_DIST+i]=(int16_t)(pr->fx[i]?pr->fx[i]-1:fx_def[i]);
        p[P_AMODE+i]=(int16_t)(pr->arp[i]?pr->arp[i]-1:TP[P_AMODE+i].def);
    }
    preset_extras(p,pr);
}
int main(void) {
    uint32_t total=0;
    printf("{\"schema\":\"SLOOP_NATIVE_PRESET_AUDIT_V1\",\"pcount\":%u,\"pe0\":%u,\"engines\":[",(unsigned)P_COUNT,(unsigned)P_E0);
    for(uint32_t ei=0;ei<NENGINES;ei++){
        const engine_t *e=ENGINES[ei];
        if(ei)putchar(',');
        printf("{\"id\":%u,\"name\":",ei);emit_string(e->name);
        printf(",\"count\":%u,\"presets\":[",e->npresets);
        for(uint32_t pi=0;pi<e->npresets;pi++){
            int16_t p[P_COUNT];
            snapshot_preset(ei,pi,p);
            if(pi)putchar(',');
            printf("{\"index\":%u,\"name\":",pi);emit_string(e->presets[pi].name);
            printf(",\"p\":[");
            for(uint32_t i=0;i<P_COUNT;i++){if(i)putchar(',');printf("%d",p[i]);}
            printf("]}");
        }
        printf("]}");total+=e->npresets;
    }
    printf("],\"total\":%u}\n",total);
    return total==153u?0:2;
}
