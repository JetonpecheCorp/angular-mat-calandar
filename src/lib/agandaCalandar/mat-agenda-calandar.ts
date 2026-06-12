import { booleanAttribute, ChangeDetectionStrategy, Component, computed, effect, input, model, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule, provideNativeDateAdapter } from '@angular/material/core';
import { MatMenu, MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EventCalandar } from '../../models/EventCalandar';
import { EventGroup } from '../../models/EventGroup';
import { SidebarConfigCalandar } from '../../models/SidebarConfigCalandar';
import { ThemeConfigCalandar } from '../../models/ThemeConfigCalandar';
import { MatDatepickerModule } from '@angular/material/datepicker';

@Component({
  selector: 'jp-mat-agenda-calandar',
  standalone: true,
  providers: [provideNativeDateAdapter()],
  imports: [
    MatDatepickerModule,
    CommonModule, MatToolbarModule, MatButtonModule, MatIconModule, MatRippleModule, 
    MatMenuModule, MatSidenavModule, MatCheckboxModule, MatExpansionModule, 
    MatProgressSpinnerModule
  ],
  templateUrl: './mat-agenda-calandar.html',
  styleUrls: ['./mat-agenda-calandar.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MatAgendaCalandar implements OnInit 
{
    events = input<EventCalandar[]>([]);
    groups = input<EventGroup[]>([]);
    customMatMenu = input<MatMenu | null>(null);

    mois = model.required<number>({ alias: "month" });
    annee = model.required<number>({ alias: "year" });
    
    useAmPm = input(false, { transform: booleanAttribute });
    readonly = input(false, { transform: booleanAttribute });
    readonlyPast = input(false, { transform: booleanAttribute });
    loading = input(false, { transform: booleanAttribute });
    showBtnAdd = input(false, { transform: booleanAttribute });
    
    themeConfig = input<ThemeConfigCalandar>();
    sidebarConfig = input<SidebarConfigCalandar>();

    eventClicked = output<EventCalandar>();
    contextClicked = output<{ action: string, event: EventCalandar }>();
    btnAddClicked = output();

    // --- VARIABLES D'ÉTAT ---
    protected panneauOuvert = signal(false);
    protected groupesMasques = signal<Set<string | number>>(new Set());
    protected estPetitEcran = signal(false);
    protected darkModeActif = signal(false);
    protected langueNavigateur = navigator.language || "fr-FR";

    protected trad = signal({
        aujourdhui: "Today", 
        ajouter: "Add new", 
        modifier: "Edit", 
        supprimer: "Delete",
        chargement: "Loading",
        ariaPrecedent: "Previous month", 
        ariaSuivant: "Next month",
        ariaMenuMois: "Change month", 
        ariaMenuAnnee: "Change year",
        sansGroupe: "Other events", 
        titreGroupes: "Themes", 
        aucunEvent: "No events scheduled this month.",
        ariaOuvrirMenu: "Open themes menu",
        ariaEvenement: "Event:",
        ariaLectureSeule: "Read-only",
        ariaFermerMenu: "Close themes menu",
    });

    private pendingScrollTime = signal<number | null>(null);

    constructor() 
    {
        effect(() => 
        {
            const isLoading = this.loading();
            const targetTime = this.pendingScrollTime();

            if (!isLoading && targetTime !== null) 
            {
                setTimeout(() => 
                {
                    this.pendingScrollTime.set(null);

                    const groupeCible = this.groupedAgendaEvents().find(g => g.dateObj.getTime() >= targetTime);
                    
                    if (groupeCible) 
                    {
                        document.getElementById('day-' + groupeCible.dateObj.getTime())?.scrollIntoView({ 
                            behavior: 'smooth', block: 'start' 
                        });
                    } 
                    else 
                        document.querySelector('.agenda-scroll-viewport')?.scrollTo({ top: 0, behavior: 'smooth' });
                }, 50);
            }
        });
    }

    protected datePickerValue = computed(() => new Date(this.annee(), this.mois() - 1, 1));

    protected nomMois = computed(() => 
    {
        const DATE = new Date(this.annee(), this.mois() - 1, 1);
        return new Intl.DateTimeFormat(this.langueNavigateur, { month: 'long' }).format(DATE);
    });

    protected displayEvents = computed(() => 
    {
        const baseEvents = this.events() ?? [];
        const masques = this.groupesMasques();
        const bloquerPasse = this.readonlyPast();
        const minuitAujourdhui = new Date().setHours(0, 0, 0, 0);

        return baseEvents.filter(ev => !masques.has(ev.groupEventId || 'sans-groupe')).map(ev => 
        {
            if (bloquerPasse && ev.startDate.getTime() < minuitAujourdhui)
                return { ...ev, readonly: true };

            return ev;
        });
    });

    protected groupedAgendaEvents = computed(() => 
    {
        const events = this.displayEvents();
        const annee = this.annee();
        const mois = this.mois(); 

        // 1. Définir les limites du mois
        const debutMois = new Date(annee, mois - 1, 1).getTime();
        const finMois = new Date(annee, mois, 0, 23, 59, 59).getTime();

        // 2. Filtrer les événements qui touchent ce mois
        const eventsDuMois = events.filter(ev => 
            ev.startDate.getTime() <= finMois && ev.endDate.getTime() >= debutMois
        );

        const groupsMap = new Map<number, { dateObj: Date, events: EventCalandar[] }>();

        // 3. Répartir les événements dans chaque jour
        eventsDuMois.forEach(ev => 
        {
            // Trouver le premier jour visible (au plus tôt le 1er du mois)
            let dateParcours = new Date(ev.startDate);
            if (dateParcours.getTime() < debutMois) {
                dateParcours = new Date(annee, mois - 1, 1);
            }
            dateParcours.setHours(0, 0, 0, 0);

            // Trouver le dernier jour visible (au plus tard le dernier jour du mois)
            let dateFinVisible = new Date(ev.endDate);
            if (dateFinVisible.getTime() > finMois) {
                dateFinVisible = new Date(annee, mois, 0);
            }
            dateFinVisible.setHours(0, 0, 0, 0);

            // 🆕 LA BOUCLE MAGIQUE : Ajouter l'événement à TOUS LES JOURS qu'il traverse
            while (dateParcours.getTime() <= dateFinVisible.getTime()) 
            {
                const t = dateParcours.getTime();

                if (!groupsMap.has(t)) {
                    groupsMap.set(t, { dateObj: new Date(t), events: [] });
                }
                
                // On ajoute l'événement au jour
                groupsMap.get(t)!.events.push(ev);

                // On passe au jour suivant
                dateParcours.setDate(dateParcours.getDate() + 1);
            }
        });

        // 4. Convertir en tableau et trier par jour
        const arrayTrie = Array.from(groupsMap.values()).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
        
        // 5. Trier chronologiquement à l'intérieur de chaque jour
        arrayTrie.forEach(groupe => {
            groupe.events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        });

        return arrayTrie;
    });

    ngOnInit(): void
    {
        if (window.innerWidth <= 768) 
            this.estPetitEcran.set(true);

        const LANGUE = this.langueNavigateur.split('-')[0];
        
        const DICT_TRADUCTION: Record<string, any> = {
            'fr': { 
                aujourdhui: "Aujourd'hui", ajouter: "Ajouter", modifier: "Modifier", supprimer: "Supprimer",
                ariaPrecedent: "Mois précédent", ariaSuivant: "Mois suivant",
                ariaMenuMois: "Changer le mois", ariaMenuAnnee: "Changer l'année",
                sansGroupe: "Autres", titreGroupes: "Thèmes", 
                aucunEvent: "Aucun événement prévu ce mois-ci.",
                ariaOuvrirMenu: "Ouvrir le menu des thèmes",
                ariaEvenement: "Événement :", ariaLectureSeule: "Lecture seule",
                chargement: "Chargement en cours",
                ariaFermerMenu: "Fermer le menu des thèmes",
            },
            'es': { 
                aujourdhui: "Hoy", ajouter: "Añadir", modifier: "Editar", supprimer: "Eliminar",
                ariaPrecedent: "Mes anterior", ariaSuivant: "Mes siguiente",
                ariaMenuMois: "Cambiar mes", ariaMenuAnnee: "Cambiar año",
                sansGroupe: "Otros", titreGroupes: "Temas", 
                aucunEvent: "No hay eventos programados este mes.",
                ariaOuvrirMenu: "Abrir el menú de temas",
                ariaEvenement: "Evento:", ariaLectureSeule: "Solo lectura",
                chargement: "Cargando",
                ariaFermerMenu: "Cerrar el menú de temas",
            },
            'it': { 
                aujourdhui: "Oggi", ajouter: "Aggiungi", modifier: "Modifica", supprimer: "Elimina",
                ariaPrecedent: "Mese precedente", ariaSuivant: "Mese successivo",
                ariaMenuMois: "Cambia mese", ariaMenuAnnee: "Cambia anno",
                sansGroupe: "Altri", titreGroupes: "Temi", 
                aucunEvent: "Nessun evento in programma questo mese.",
                ariaOuvrirMenu: "Apri il menu dei temi",
                ariaEvenement: "Evento:", ariaLectureSeule: "Sola lettura",
                chargement: "Caricamento",
                ariaFermerMenu: "Chiudi il menu dei temi",
            },
            'de': { 
                aujourdhui: "Heute", ajouter: "Hinzufügen", modifier: "Bearbeiten", supprimer: "Löschen",
                ariaPrecedent: "Vorheriger Monat", ariaSuivant: "Nächster Monat",
                ariaMenuMois: "Monat ändern", ariaMenuAnnee: "Jahr ändern",
                sansGroupe: "Andere", titreGroupes: "Themen", 
                aucunEvent: "Diesen Monat sind keine Ereignisse geplant.",
                ariaOuvrirMenu: "Themenmenü öffnen",
                ariaEvenement: "Ereignis:", ariaLectureSeule: "Schreibgeschützt",
                chargement: "Wird geladen",
                ariaFermerMenu: "Themenmenü schließen",
            },
            'pt': { 
                aujourdhui: "Hoje", ajouter: "Adicionar", modifier: "Editar", supprimer: "Excluir",
                ariaPrecedent: "Mês anterior", ariaSuivant: "Mês seguinte",
                ariaMenuMois: "Mudar mês", ariaMenuAnnee: "Mudar ano",
                sansGroupe: "Outros", titreGroupes: "Temas", 
                aucunEvent: "Nenhum evento programado para este mês.",
                ariaOuvrirMenu: "Abrir o menu de temas",
                ariaEvenement: "Evento:", ariaLectureSeule: "Somente leitura",
                chargement: "Carregando",
                ariaFermerMenu: "Fechar o menu de temas",
            }
        };

        if(DICT_TRADUCTION[LANGUE])
            this.trad.set(DICT_TRADUCTION[LANGUE]);
    }

    protected OnDateSelected(date: Date | null): void 
    {
        if (!date) 
            return;
        
        this.annee.set(date.getFullYear());
        this.mois.set(date.getMonth() + 1);

        this.pendingScrollTime.set(date.setHours(0, 0, 0, 0));
    }

    protected GetStartDisplay(ev: EventCalandar, dateGroupe: Date): string 
    {
        const estSurPlusieursJours = !this.EstMemeJour(ev.startDate, ev.endDate);

        // CAS 1 : Événement d'un seul jour OU on est sur le TOUT PREMIER jour de l'événement
        if (!estSurPlusieursJours || this.EstMemeJour(ev.startDate, dateGroupe))
            return this.FormatTime(ev.startDate);

        // CAS 2 : Événement sur plusieurs jours ET on n'est PAS sur la date de début
        return `${this.FormaterJourMois(ev.startDate)} - ${this.FormatTime(ev.startDate)}`;
    }

    protected GetEndDisplay(ev: EventCalandar, dateGroupe: Date): string 
    {
        const estSurPlusieursJours = !this.EstMemeJour(ev.startDate, ev.endDate);

        // afficher heure de fin
        if (!estSurPlusieursJours || this.EstMemeJour(ev.endDate, dateGroupe))
            return this.FormatTime(ev.endDate);

        // CAS 2 : Événement sur plusieurs jours et on est sur un jour intermédiaire ou le premier jour
        return `${this.FormaterJourMois(ev.endDate)} - ${this.FormatTime(ev.endDate)}`;
    }

    protected FormatDureeEvent(ev: EventCalandar): string 
    {
        const heureDebut = this.FormatTime(ev.startDate);
        const heureFin = this.FormatTime(ev.endDate);

        // Si l'événement commence et se termine le même jour
        if (ev.startDate.getDate() === ev.endDate.getDate() &&
            ev.startDate.getMonth() === ev.endDate.getMonth() &&
            ev.startDate.getFullYear() === ev.endDate.getFullYear()) 
        {
            return `${heureDebut} - ${heureFin}`;
        } 
        else 
        {
            // Si l'événement est à cheval sur plusieurs jours
            const dateFinCourte = ev.endDate.toLocaleDateString(this.langueNavigateur, { 
                day: 'numeric', 
                month: 'short' 
            });

            return `${heureDebut} au ${dateFinCourte} à ${heureFin}`;
        }
    }

    protected GetEventStyle(eventObj: EventCalandar): any 
    {
        if (!eventObj.groupEventId) return {};
        const group = this.groups().find(g => g.id === eventObj.groupEventId);
        if (!group) return {};

        return {
            '--event-bg': this.darkModeActif() ? (group.bgColorDark || group.bgColorLight) : group.bgColorLight,
            '--event-text': this.darkModeActif() ? (group.textColorDark || group.textColorLight) : group.textColorLight
        };
    }

    protected Precedent() 
    {
        let n = this.mois() == 1 ? 12 : this.mois() - 1;

        if (n === 12) 
            this.annee.set(this.annee() - 1);

        this.mois.set(n);
    }

    protected Suivant() 
    {
        let n = this.mois() === 12 ? 1 : this.mois() + 1;

        if (n === 1) 
            this.annee.set(this.annee() + 1);
        this.mois.set(n);
    }

    protected AllerAujourdhui(): void
    {
        let date = new Date();

        this.mois.set(date.getMonth() + 1);
        this.annee.set(date.getFullYear());

        this.pendingScrollTime.set(new Date(this.annee(), this.mois() -1, date.getDate()).setHours(0, 0, 0, 0));
    }

    protected EstMemeJour(date1: Date, date2: Date): boolean 
    {
        return date1.getDate() === date2.getDate() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getFullYear() === date2.getFullYear();
    }

    protected FormatDateAria(date: Date): string 
    {
        return date.toLocaleDateString(this.langueNavigateur, { weekday: 'long', day: 'numeric', month: 'long' });
    }

    protected FormatTime(_date: Date): string 
    {
        return _date.toLocaleTimeString(this.langueNavigateur, { hour: '2-digit', minute: '2-digit', hour12: this.useAmPm() });
    }

    protected FormaterJourMois(_date: Date): string 
    {
        // Septembre à decembre
        const formatMois = _date.getMonth() >= 8 ? 'short' : 'long';

        return _date.toLocaleDateString(this.langueNavigateur, { 
            day: 'numeric', 
            month: formatMois 
        });
    }

    protected OnContextMenuAction(_action: string, _event: EventCalandar): void 
    { 
        this.contextClicked.emit({
            action: _action,
            event: {
            id: _event.id,
            readonly: _event.readonly,
            groupEventId: _event.groupEventId,
            startDate: _event.startDate,
            endDate: _event.endDate,
            titre: _event.titre,
            description: _event.description
        }});
    }

    protected GetEventAriaLabel(ev: EventCalandar, dateGroupe: Date): string 
    {
        const heureDebut = this.GetStartDisplay(ev, dateGroupe);
        const heureFin = this.GetEndDisplay(ev, dateGroupe);
        const lectureSeule = (this.readonly() || ev.readonly) ? `, ${this.trad().ariaLectureSeule}` : '';
        
        return `${this.trad().ariaEvenement} ${ev.titre}, ${heureDebut} ${heureFin}${lectureSeule}`;
    }

    protected OnEventKeydown(event: KeyboardEvent, ev: EventCalandar): void
    {
        if (event.key === 'Enter' || event.key === ' ') 
        {
            event.preventDefault();
            this.eventClicked.emit(ev);
        }
    }
}