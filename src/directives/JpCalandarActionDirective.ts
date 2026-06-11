import { Directive, computed, effect, inject, input, ElementRef } from '@angular/core';
import { MatMenuItem } from '@angular/material/menu';

@Directive({
  selector: '[jpCalendarAction]',
  standalone: true
})
export class JpCalendarActionDirective 
{
    private menuItem = inject(MatMenuItem, { optional: true });
    private el = inject(ElementRef);

    calendar = input.required<any>({ alias: 'jpCalendarAction' });
    event = input.required<any>();

    estDesactiver = computed(() => 
    {
        const cal = this.calendar();
        const ev = this.event();

        if (!cal || !ev) 
            return false;

        const calReadonly = cal.readonly?.() ?? false;
        const calReadonlyPast = cal.readonlyPast?.() ?? false;
        const evReadonly = ev.readonly ?? false;

        let estDansLePasse = false;
        if (calReadonlyPast && ev.startDate) 
        {
            const timestampEvent = new Date(ev.startDate).getTime();
            
            estDansLePasse = cal.heures 
                ? timestampEvent < Date.now() 
                : timestampEvent < new Date().setHours(0, 0, 0, 0);
        }

        return calReadonly || evReadonly || estDansLePasse;
    });

    constructor() 
    {
        effect(() => 
        {
            const doitDesactiver = this.estDesactiver(); 

            if (this.menuItem)
                this.menuItem.disabled = doitDesactiver; 
 
            else 
            {
                this.el.nativeElement.disabled = doitDesactiver; 

                if (doitDesactiver)
                    this.el.nativeElement.setAttribute('aria-disabled', 'true');

                else
                    this.el.nativeElement.removeAttribute('aria-disabled');
            }
        });
    }
}