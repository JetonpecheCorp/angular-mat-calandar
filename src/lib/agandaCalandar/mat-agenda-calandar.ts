import { booleanAttribute, ChangeDetectionStrategy, Component, computed, effect, input, model, OnDestroy, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DATE_LOCALE, MatRippleModule, provideNativeDateAdapter } from '@angular/material/core';
import { MatMenu, MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EventCalandar } from '../../models/EventCalandar';
import { EventGroup } from '../../models/EventGroup';
import { DateSpecialEvent } from '../../models/DateSpecialEvent';
import { SidebarConfigCalandar } from '../../models/SidebarConfigCalandar';
import { ThemeConfigCalandar } from '../../models/ThemeConfigCalandar';
import { MatDatepickerModule } from '@angular/material/datepicker';

@Component({
  selector: 'jp-mat-agenda-calandar',
  standalone: true,
  providers: [
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: navigator.language || 'en-US' }
  ],
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
export class MatAgendaCalandar implements OnInit, OnDestroy
{
    events = input<EventCalandar[]>([]);
    specialEvents = input<DateSpecialEvent[]>([]);
    groups = input<EventGroup[]>([]);
    customMatMenu = input<MatMenu | null>(null);

    /** 0 => Sunday, 6 => Monday */
    daysOfWeekDisabled = input<number[]>([]);

    /** 1 => January, 12 => december */
    mois = model.required<number>({ alias: "month" });
    annee = model.required<number>({ alias: "year" });
    
    useAmPm = input(false, { transform: booleanAttribute });
    readonly = input(false, { transform: booleanAttribute });
    readonlyPast = input(false, { transform: booleanAttribute });
    loading = input(false, { transform: booleanAttribute });
    showBtnAdd = input(false, { transform: booleanAttribute });
    hideNavYearBtn = input(false, { transform: booleanAttribute });
    
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
        ariaAnneePrecedente: "Previous year", 
        ariaAnneeSuivante: "Next year",
        ariaMenuMois: "Change month", 
        ariaMenuAnnee: "Change year",
        sansGroupe: "Other events", 
        titreGroupes: "Themes", 
        aucunEvent: "No events scheduled this month.",
        ariaOuvrirMenu: "Open themes menu",
        ariaFermerMenu: "Close themes menu",
        ariaEvenement: "Event:",
        ariaLectureSeule: "Read-only",
        ariaMasquerGroupe: "Hide",
        ariaAfficherGroupe: "Show",
        ariaOuvrirEvent: "Open event",
        ariaEventSpecial: "Special event:"
    });

    private themeObserver: MutationObserver | null = null;
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
        const specialEvs = this.specialEvents();
        const annee = this.annee();
        const mois = this.mois(); 
        const joursDesactives = this.daysOfWeekDisabled();

        const debutMois = new Date(annee, mois - 1, 1).getTime();
        const finMois = new Date(annee, mois, 0, 23, 59, 59).getTime();

        const eventsDuMois = events.filter(ev => 
            ev.startDate.getTime() <= finMois && ev.endDate.getTime() >= debutMois
        );

        const groupsMap = new Map<number, { dateObj: Date, events: EventCalandar[], specialEvents: DateSpecialEvent[] }>();

        // --- PASSE 1 : Événements standards ---
        eventsDuMois.forEach(ev => 
        {
            let dateParcours = new Date(ev.startDate);
            if (dateParcours.getTime() < debutMois) dateParcours = new Date(annee, mois - 1, 1);
            dateParcours.setHours(0, 0, 0, 0);

            let dateFinVisible = new Date(ev.endDate);
            if (dateFinVisible.getTime() > finMois) dateFinVisible = new Date(annee, mois, 0);
            dateFinVisible.setHours(0, 0, 0, 0);

            while (dateParcours.getTime() <= dateFinVisible.getTime()) 
            {
                const t = dateParcours.getTime();
                const dayOfWeek = dateParcours.getDay(); // 🆕 Identifie le jour de la semaine (0-6)

                // 🆕 N'ajoute la journée que si elle ne fait pas partie des jours désactivés
                if (!joursDesactives.includes(dayOfWeek)) 
                {
                    if (!groupsMap.has(t)) {
                        groupsMap.set(t, { dateObj: new Date(t), events: [], specialEvents: [] });
                    }
                    groupsMap.get(t)!.events.push(ev);
                }
                dateParcours.setDate(dateParcours.getDate() + 1);
            }
        });

        if (specialEvs.length > 0) 
        {
            let dateParcours = new Date(annee, mois - 1, 1);
            const fin = new Date(annee, mois, 0);
            
            while (dateParcours.getTime() <= fin.getTime()) 
            {
                const M = dateParcours.getMonth() + 1;
                const D = dateParcours.getDate();
                const dayOfWeek = dateParcours.getDay();

                // 🆕 On applique également le filtre sur les badges spéciaux
                if (!joursDesactives.includes(dayOfWeek)) 
                {
                    const spForDay = specialEvs.filter(sp => {
                        const startM = sp.dateStart.month;
                        const startD = sp.dateStart.day;
                        const endM = sp.dateEnd.month;
                        const endD = sp.dateEnd.day;

                        const isNormalInterval = (startM < endM) || (startM === endM && startD <= endD);

                        if (isNormalInterval) 
                            return (M > startM || (M === startM && D >= startD)) && (M < endM || (M === endM && D <= endD));
                        else 
                            return (M > startM || (M === startM && D >= startD)) || (M < endM || (M === endM && D <= endD));
                    });

                    if (spForDay.length > 0) 
                    {
                        const t = dateParcours.getTime();
                        if (!groupsMap.has(t)) {
                            groupsMap.set(t, { dateObj: new Date(t), events: [], specialEvents: [] });
                        }
                        groupsMap.get(t)!.specialEvents = spForDay;
                    }
                }

                dateParcours.setDate(dateParcours.getDate() + 1);
            }
        }

        const arrayTrie = Array.from(groupsMap.values()).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
        
        arrayTrie.forEach(groupe => {
            groupe.events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        });

        return arrayTrie;
    });

    protected listeEvenementGroupe = computed(() => 
    {
        const tousLesEvents = this.events() || [];
        const tousLesGroupes = this.groups() || [];
        const resultat: { group: any | null, events: EventCalandar[] }[] = [];

        // Événements avec groupe
        tousLesGroupes.forEach(g => 
        {
            const evs = tousLesEvents.filter(e => e.groupEventId === g.id);
            if (evs.length > 0)
                resultat.push({ group: g, events: evs });
        });

        // Événements sans groupe
        const sansGroupe = tousLesEvents.filter(e => !e.groupEventId);

        if (sansGroupe.length > 0)
            resultat.push({ group: null, events: sansGroupe });

        return resultat;
    });

    ngOnInit(): void
    {
        if (window.innerWidth <= 768) 
            this.estPetitEcran.set(true);

        this.VerifierTheme();

        // Surveille les changements de classe sur la balise <html> et <body>
        this.themeObserver = new MutationObserver(() => {
            this.VerifierTheme();
        });

        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        const LANGUE = this.langueNavigateur.split('-')[0];
        
        const DICT_TRADUCTION: Record<string, any> = {
            'fr': { 
                aujourdhui: "Aujourd'hui", ajouter: "Ajouter", modifier: "Modifier", supprimer: "Supprimer",
                chargement: "Chargement en cours",
                ariaPrecedent: "Mois précédent", ariaSuivant: "Mois suivant",
                ariaAnneePrecedente: "Année précédente", ariaAnneeSuivante: "Année suivante",
                ariaMenuMois: "Changer le mois", ariaMenuAnnee: "Changer l'année",
                sansGroupe: "Autres événements", titreGroupes: "Thèmes", 
                aucunEvent: "Aucun événement prévu ce mois-ci.",
                ariaOuvrirMenu: "Ouvrir le menu des thèmes", ariaFermerMenu: "Fermer le menu des thèmes",
                ariaEvenement: "Événement :", ariaLectureSeule: "Lecture seule",
                ariaMasquerGroupe: "Masquer", ariaAfficherGroupe: "Afficher", ariaOuvrirEvent: "Ouvrir l'événement",
                ariaEventSpecial: "Événement spécial :"
            },
            'es': {
                aujourdhui: "Hoy", ajouter: "Añadir", modifier: "Editar", supprimer: "Eliminar",
                chargement: "Cargando",
                ariaPrecedent: "Mes anterior", ariaSuivant: "Mes siguiente",
                ariaAnneePrecedente: "Año anterior", ariaAnneeSuivante: "Año siguiente",
                ariaMenuMois: "Cambiar mes", ariaMenuAnnee: "Cambiar año",
                sansGroupe: "Otros eventos", titreGroupes: "Temas", 
                aucunEvent: "No hay eventos programados este mes.",
                ariaOuvrirMenu: "Abrir el menú de temas", ariaFermerMenu: "Cerrar le menú de temas",
                ariaEvenement: "Evento:", ariaLectureSeule: "Solo lectura",
                ariaMasquerGroupe: "Ocultar", ariaAfficherGroupe: "Mostrar", ariaOuvrirEvent: "Abrir evento",
                ariaEventSpecial: "Evento especial:"
            },
            'it': { 
                aujourdhui: "Oggi", ajouter: "Aggiungi", modifier: "Modifica", supprimer: "Elimina",
                chargement: "Caricamento",
                ariaPrecedent: "Mese precedente", ariaSuivant: "Mese successivo",
                ariaAnneePrecedente: "Anno precedente", ariaAnneeSuivante: "Anno successivo",
                ariaMenuMois: "Cambia mese", ariaMenuAnnee: "Cambia anno",
                sansGroupe: "Altri eventi", titreGroupes: "Temi", 
                aucunEvent: "Nessun evento in programma questo mese.",
                ariaOuvrirMenu: "Apri il menu dei temi", ariaFermerMenu: "Chiudi il menu dei temi",
                ariaEvenement: "Evento:", ariaLectureSeule: "Sola lettura",
                ariaMasquerGroupe: "Nascondi", ariaAfficherGroupe: "Mostra", ariaOuvrirEvent: "Apri evento",
                ariaEventSpecial: "Evento speciale:"
            },
            'de': { 
                aujourdhui: "Heute", ajouter: "Hinzufügen", modifier: "Bearbeiten", supprimer: "Löschen",
                chargement: "Wird geladen",
                ariaPrecedent: "Vorheriger Monat", ariaSuivant: "Nächster Monat",
                ariaAnneePrecedente: "Vorheriges Jahr", ariaAnneeSuivante: "Nächstes Jahr",
                ariaMenuMois: "Monat ändern", ariaMenuAnnee: "Jahr ändern",
                sansGroupe: "Andere Ereignisse", titreGroupes: "Themen", 
                aucunEvent: "Diesen Monat sind keine Ereignisse geplant.",
                ariaOuvrirMenu: "Themenmenü öffnen", ariaFermerMenu: "Themenmenü schließen",
                ariaEvenement: "Ereignis:", ariaLectureSeule: "Schreibgeschützt",
                ariaMasquerGroupe: "Ausblenden", ariaAfficherGroupe: "Anzeigen", ariaOuvrirEvent: "Ereignis öffnen",
                ariaEventSpecial: "Besonderes Ereignis:"
            },
            'pt': { 
                aujourdhui: "Hoje", ajouter: "Adicionar", modifier: "Editar", supprimer: "Excluir",
                chargement: "Carregando",
                ariaPrecedent: "Mês anterior", ariaSuivant: "Mês seguinte",
                ariaAnneePrecedente: "Ano anterior", ariaAnneeSuivante: "Ano seguinte",
                ariaMenuMois: "Mudar mês", ariaMenuAnnee: "Mudar ano",
                sansGroupe: "Outros eventos", titreGroupes: "Temas", 
                aucunEvent: "Nenhum evento programado para este mês.",
                ariaOuvrirMenu: "Abrir o menu de temas", ariaFermerMenu: "Fechar o menu de temas",
                ariaEvenement: "Evento:", ariaLectureSeule: "Somente leitura",
                ariaMasquerGroupe: "Ocultar", ariaAfficherGroupe: "Mostrar", ariaOuvrirEvent: "Abrir evento",
                ariaEventSpecial: "Evento especial:"
            }
        };

        if(DICT_TRADUCTION[LANGUE])
            this.trad.set(DICT_TRADUCTION[LANGUE]);
    }

    ngOnDestroy(): void 
    {
        if (this.themeObserver)
            this.themeObserver.disconnect();
    }

    protected dateFilter = (date: Date | null): boolean => 
    {
        if (!date) return true;
        
        return !this.daysOfWeekDisabled().includes(date.getDay());
    };

    protected ScrollHorizontal(event: WheelEvent): void 
    {
        const conteneur = event.currentTarget as HTMLElement;

        if (conteneur.scrollWidth > conteneur.clientWidth)
        {
            event.preventDefault();  
            conteneur.scrollLeft += event.deltaY; 
        }
    }

    protected BasculerVisibiliteGroupe(idGroupe: string | number | null): void 
    {
        const actuel = new Set(this.groupesMasques());
        const idABasculer = idGroupe === null ? 'sans-groupe' : idGroupe;
        
        if (actuel.has(idABasculer))
            actuel.delete(idABasculer);
        else
            actuel.add(idABasculer);

        this.groupesMasques.set(actuel);
    }

    protected EstGroupeMasque(idGroupe: string | number | null): boolean 
    {
        const idAVerifier = idGroupe === null ? 'sans-groupe' : idGroupe;
        return this.groupesMasques().has(idAVerifier);
    }

    protected FormaterDateCourte(_date: Date): string 
    { 
        if (!_date) 
            return '';
        
        return new Intl.DateTimeFormat(this.langueNavigateur, { day: '2-digit', month: 'short' }).format(_date);
    }

    protected ClickEvent(_event: EventCalandar): void 
    {
        this.eventClicked.emit(_event);
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

    protected AnneePrecedente(): void 
    {
        this.annee.set(this.annee() - 1);
    }

    protected AnneeSuivante(): void 
    {
        this.annee.set(this.annee() + 1);
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

    private VerifierTheme(): void 
    {
        const config = this.themeConfig();
        const classDark = config?.darkModeClass || '';
        const classLight = config?.lightModeClass || '';
        const themeDefaut = config?.defaultTheme || 'light';
        
        const aClasseSombre = classDark ? 
            (document.body.classList.contains(classDark) || document.documentElement.classList.contains(classDark)) : false;

        const aClasseClaire = classLight ? 
            (document.body.classList.contains(classLight) || document.documentElement.classList.contains(classLight)) : false;

        if (aClasseSombre) 
            this.darkModeActif.set(true);

        else if (aClasseClaire) 
            this.darkModeActif.set(false);

        else 
            this.darkModeActif.set(themeDefaut == 'dark');
    }
}