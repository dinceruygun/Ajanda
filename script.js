document.addEventListener('DOMContentLoaded', function() {
    let selectedPersonelId = null;
    let selectedPersonelCode = null;
    let calendar = null;
    let events = [];
    let eventParticipants = [];
    let personelData = null;
    let selectedPersonels = new Set();
    let activityTypes = null;
    let personTypes = null;
    let selectedDate = null;
    let selectedPersonTypes = new Set();
    let selectedActivityTypes = new Set();
    let currentProjectName = 'default'; // Varsayılan proje adı
    let holidays = []; // Tatiller için yeni değişken

    // Modal ve buton elementlerini tanımla
    const modal = document.getElementById('eventModal');
    const newEventBtn = document.getElementById('newEventBtn');
    const saveChangesBtn = document.getElementById('saveChangesBtn');
    const closeBtn = document.querySelector('.close');
    const eventForm = document.getElementById('eventForm');
    const deleteBtn = document.getElementById('deleteEvent');

    // Değişiklikleri takip etmek için değişkenler
    let hasUnsavedChanges = false;
    let pendingChanges = {
        newEvents: [],
        updatedEvents: [],
        deletedEvents: []
    };

    // Yeni aktivite butonu için click event listener
    if (newEventBtn) {
        newEventBtn.addEventListener('click', function() {
            selectedDate = null; // Seçili tarihi sıfırla
            openNewEventModal();
        });
    }

    // Modal backdrop elementini oluştur
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';
    document.body.appendChild(modalBackdrop);

    // Performans optimizasyonu için önbellek
    const cache = {
        personelById: new Map(),
        eventsByPersonelId: new Map(),
        participantsByEventId: new Map(),
        activityTypeById: new Map(),
        personTypeById: new Map()
    };

    // Önbelleği güncelle
    function updateCache() {
        // Personel önbelleği
        personelData.personeller.forEach(personel => {
            cache.personelById.set(personel.id, personel);
        });

        // Aktivite türü önbelleği
        activityTypes.forEach(type => {
            cache.activityTypeById.set(type.id, type);
        });

        // Personel türü önbelleği
        personTypes.forEach(type => {
            cache.personTypeById.set(type.id, type);
        });

        // Katılımcı önbelleği
        eventParticipants.forEach(participant => {
            if (!cache.participantsByEventId.has(participant.eventId)) {
                cache.participantsByEventId.set(participant.eventId, []);
            }
            cache.participantsByEventId.get(participant.eventId).push(participant);
        });

        // Personel aktiviteleri önbelleği
        eventParticipants.forEach(participant => {
            if (!cache.eventsByPersonelId.has(participant.personelId)) {
                cache.eventsByPersonelId.set(participant.personelId, []);
            }
            const event = events.find(e => e.id === participant.eventId);
            if (event) {
                cache.eventsByPersonelId.get(participant.personelId).push(event);
            }
        });
    }

    // Personel bilgilerini önbellekten al
    function getPersonelById(id) {
        return cache.personelById.get(id);
    }

    // Personelin aktivitelerini önbellekten al
    function getPersonelEvents(personelId) {
        return cache.eventsByPersonelId.get(personelId) || [];
    }

    // Aktivite katılımcılarını önbellekten al
    function getEventParticipants(eventId) {
        return cache.participantsByEventId.get(eventId) || [];
    }

    // Aktivite türünü önbellekten al
    function getActivityTypeById(id) {
        return cache.activityTypeById.get(id);
    }

    // Personel türünü önbellekten al
    function getPersonTypeById(id) {
        return cache.personTypeById.get(id);
    }

    // Önbelleği temizle
    function clearCache() {
        cache.personelById.clear();
        cache.eventsByPersonelId.clear();
        cache.participantsByEventId.clear();
        cache.activityTypeById.clear();
        cache.personTypeById.clear();
    }

    // URL'den proje adını al
    function getProjectNameFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('project') || 'default';
    }

    // URL'yi güncelle
    function updateUrlWithProjectName(projectName) {
        const url = new URL(window.location.href);
        if (projectName && projectName !== 'default') {
            url.searchParams.set('project', projectName);
        } else {
            url.searchParams.delete('project');
        }
        window.history.pushState({}, '', url);
    }

    // URL'den personel kodunu al
    function getPersonelCodeFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('code');
    }

    // Personel koduna göre personeli seç
    function selectPersonelByCode(code) {
        console.log('Personel seçimi başlatılıyor, kod:', code);
        const personel = personelData.personeller.find(p => p.code === code);
        if (personel) {
            console.log('Personel bulundu:', personel);
            selectedPersonelId = personel.id;
            selectedPersonelCode = personel.code;
            
            // Personel listesinde seçili personeli işaretle
            const personelItem = document.querySelector(`.personel-item[data-code="${code}"]`);
            if (personelItem) {
                document.querySelectorAll('.personel-item').forEach(i => i.classList.remove('active'));
                personelItem.classList.add('active');
            }
            
            // Takvimi güncelle
            updateCalendarEvents();
        } else {
            console.warn('Personel bulunamadı:', code);
        }
    }

    // JSON verilerini yükle
    async function loadData() {
        try {
            console.log('Veri yükleme başladı...');

            // URL'den proje adını al
            currentProjectName = getProjectNameFromUrl();
            console.log('Aktif proje:', currentProjectName);

            // Tüm veri yükleme işlemlerini paralel olarak yap
            const [personelResponse, eventsResponse, participantsResponse, activityTypesResponse, personTypesResponse, holidaysResponse] = await Promise.all([
                fetch(`data/personel.json?project=${currentProjectName}`),
                fetch(`data/events.json?project=${currentProjectName}`),
                fetch(`data/eventParticipants.json?project=${currentProjectName}`),
                fetch(`data/activityTypes.json?project=${currentProjectName}`),
                fetch(`data/personTypes.json?project=${currentProjectName}`),
                fetch(`data/holidays.json?project=${currentProjectName}`)
            ]);

            // Her bir yanıtın başarılı olup olmadığını kontrol et
            if (!personelResponse.ok || !eventsResponse.ok || !participantsResponse.ok || 
                !activityTypesResponse.ok || !personTypesResponse.ok || !holidaysResponse.ok) {
                throw new Error('Veri yükleme hatası: Bir veya daha fazla veri kaynağına erişilemedi');
            }

            // JSON verilerini parse et
            const [personelDataResponse, eventDataResponse, participantsDataResponse, 
                  activityTypesDataResponse, personTypesDataResponse, holidaysDataResponse] = await Promise.all([
                personelResponse.json(),
                eventsResponse.json(),
                participantsResponse.json(),
                activityTypesResponse.json(),
                personTypesResponse.json(),
                holidaysResponse.json()
            ]);

            // Proje adı kontrolü
            if (personelDataResponse.project_name !== currentProjectName || 
                eventDataResponse.project_name !== currentProjectName ||
                holidaysDataResponse.project_name !== currentProjectName) {
                throw new Error('Proje adı uyuşmazlığı: Veriler farklı bir projeye ait');
            }

            // Global değişkenleri güncelle
            personelData = personelDataResponse;
            events = eventDataResponse.events;
            eventParticipants = participantsDataResponse.eventParticipants;
            activityTypes = activityTypesDataResponse.activityTypes;
            personTypes = personTypesDataResponse.personTypes;

            // Tatilleri yükle
            const currentYear = new Date().getFullYear();
            const yearHolidays = holidaysDataResponse.holidays.find(h => h.year === currentYear);
            if (yearHolidays) {
                // Sabit tatilleri yükle
                const fixedHolidays = yearHolidays.fixed_holidays.map(holiday => {
                    // Tarihi parçalara ayır
                    const [month, day] = holiday.date.split('-');
                    // Yerel saat diliminde tarih oluştur
                    const date = new Date(currentYear, parseInt(month) - 1, parseInt(day));
                    // ISO formatına çevir (saat dilimi düzeltmesi ile)
                    const isoDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                    
                    return {
                        date: isoDate,
                        title: holiday.title,
                        type: 'fixed'
                    };
                });

                // Dini bayramları yükle
                const religiousHolidays = yearHolidays.religious_holidays.map(holiday => {
                    // Tarihi parçalara ayır
                    const [month, day] = holiday.date.split('-');
                    // Yerel saat diliminde tarih oluştur
                    const date = new Date(currentYear, parseInt(month) - 1, parseInt(day));
                    // ISO formatına çevir (saat dilimi düzeltmesi ile)
                    const isoDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                    
                    return {
                        date: isoDate,
                        title: holiday.title,
                        type: 'religious'
                    };
                });

                // Tüm tatilleri birleştir
                holidays = [...fixedHolidays, ...religiousHolidays];

                console.log('Yüklenen tatiller:', holidays);
            }

            console.log('Global değişkenler güncellendi:', {
                personelData: !!personelData,
                events: events?.length,
                eventParticipants: eventParticipants?.length,
                activityTypes: activityTypes?.length,
                personTypes: personTypes?.length,
                holidays: holidays?.length
            });

            // Veri bütünlüğünü kontrol et
            validateDataIntegrity();

            // UI bileşenlerini başlat
            initCalendar();
            createPersonelList();
            createFilterToggles();
            loadActivityTypes();

            // URL'den gelen personel koduna göre personeli seç
            const initialPersonelCode = getPersonelCodeFromUrl();
            if (initialPersonelCode) {
                console.log('URL\'den gelen personel kodu:', initialPersonelCode);
                selectPersonelByCode(initialPersonelCode);
            }

            // Takvim olaylarını güncelle
            updateCalendarEvents();
            
            // Önbelleği güncelle
            clearCache();
            updateCache();

            console.log('Tüm veriler başarıyla yüklendi');
        } catch (error) {
            console.error('Veri yükleme hatası:', error);
            showErrorMessage('Veriler yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
        }
    }

    // Veri bütünlüğünü kontrol et
    function validateDataIntegrity() {
        console.log('Veri bütünlüğü kontrolü başladı:', {
            personelData: !!personelData,
            personeller: personelData?.personeller?.length,
            events: events?.length,
            eventParticipants: eventParticipants?.length,
            activityTypes: activityTypes?.length,
            personTypes: personTypes?.length
        });

        // Verilerin yüklendiğinden emin ol
        if (!personelData || !personelData.personeller || !events || !eventParticipants || 
            !activityTypes || !personTypes) {
            console.error('Eksik veriler:', {
                personelData: !!personelData,
                personeller: !!personelData?.personeller,
                events: !!events,
                eventParticipants: !!eventParticipants,
                activityTypes: !!activityTypes,
                personTypes: !!personTypes
            });
            throw new Error('Veri bütünlüğü kontrolü için gerekli veriler eksik');
        }

        // Personel ID'lerinin benzersiz olduğunu kontrol et
        const personelIds = new Set();
        personelData.personeller.forEach(personel => {
            if (personelIds.has(personel.id)) {
                throw new Error(`Tekrarlanan personel ID'si bulundu: ${personel.id}`);
            }
            personelIds.add(personel.id);
        });

        // Aktivite ID'lerinin benzersiz olduğunu kontrol et
        const eventIds = new Set();
        events.forEach(event => {
            if (eventIds.has(event.id)) {
                throw new Error(`Tekrarlanan aktivite ID'si bulundu: ${event.id}`);
            }
            eventIds.add(event.id);
        });

        // Eğer birden fazla personel varsa katılımcı referanslarını kontrol et
        if (personelData.personeller.length > 1) {
            // Katılımcı referanslarının geçerli olduğunu kontrol et
            eventParticipants.forEach(participant => {
                if (!personelIds.has(participant.personelId)) {
                    throw new Error(`Geçersiz personel referansı: ${participant.personelId}`);
                }
                if (!eventIds.has(participant.eventId)) {
                    throw new Error(`Geçersiz aktivite referansı: ${participant.eventId}`);
                }
            });
        }

        // Aktivite türlerinin geçerli olduğunu kontrol et
        const activityTypeIds = new Set(activityTypes.map(type => type.id));
        events.forEach(event => {
            if (!activityTypeIds.has(event.activityTypeId)) {
                throw new Error(`Geçersiz aktivite türü referansı: ${event.activityTypeId}`);
            }
        });

        // Personel türlerinin geçerli olduğunu kontrol et
        const personTypeIds = new Set(personTypes.map(type => type.id));
        personelData.personeller.forEach(personel => {
            if (!personTypeIds.has(personel.typeId)) {
                throw new Error(`Geçersiz personel türü referansı: ${personel.typeId}`);
            }
        });

        console.log('Veri bütünlüğü kontrolü başarıyla tamamlandı');
    }

    // Hata mesajı göster
    function showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <div class="error-content">
                <span class="error-icon">⚠️</span>
                <span class="error-text">${message}</span>
                <button class="error-close">&times;</button>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
        
        // Kapatma butonuna tıklama olayı ekle
        errorDiv.querySelector('.error-close').addEventListener('click', () => {
            errorDiv.remove();
        });
        
        // 5 saniye sonra otomatik kapat
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    // Aktivite türlerini yükle
    function loadActivityTypes() {
        console.log('Aktivite türleri yükleniyor...');
        console.log('Aktivite türleri:', activityTypes);

        // Modal içindeki aktivite türleri
        const modalActivityTypeToggles = document.querySelector('.modal-content .activity-type-toggles');
        if (modalActivityTypeToggles) {
            console.log('Modal aktivite türleri alanı bulundu');
            modalActivityTypeToggles.innerHTML = '';
            activityTypes.forEach(type => {
                const toggle = document.createElement('div');
                toggle.className = 'activity-type-toggle';
                toggle.dataset.id = type.id;
                toggle.dataset.color = type.color;
                toggle.style.color = type.color;
                toggle.innerHTML = `
                    <div class="color-preview" style="background-color: ${type.color}"></div>
                    <span class="toggle-text">${type.name}</span>
                `;
                
                toggle.addEventListener('click', function() {
                    document.querySelectorAll('.activity-type-toggle').forEach(t => {
                        t.classList.remove('selected');
                        t.style.backgroundColor = 'transparent';
                        t.style.color = t.dataset.color;
                    });
                    this.classList.add('selected');
                    this.style.backgroundColor = type.color;
                    this.style.color = '#ffffff';
                });
                
                modalActivityTypeToggles.appendChild(toggle);
            });

            // Varsayılan olarak "Boş" seçeneğini seç
            const emptyToggle = modalActivityTypeToggles.querySelector('.activity-type-toggle[data-id="0"]');
            if (emptyToggle) {
                emptyToggle.classList.add('selected');
                emptyToggle.style.backgroundColor = emptyToggle.dataset.color;
                emptyToggle.style.color = '#ffffff';
            }
        } else {
            console.error('Modal aktivite türleri alanı bulunamadı!');
        }

        // Filtre panelindeki aktivite türleri
        const filterActivityTypeToggles = document.querySelector('.filter-panel .activity-type-toggles');
        if (filterActivityTypeToggles) {
            console.log('Filtre aktivite türleri alanı bulundu');
            filterActivityTypeToggles.innerHTML = '';
            activityTypes.forEach(type => {
                const toggle = document.createElement('div');
                toggle.className = 'filter-toggle';
                toggle.dataset.id = type.id;
                toggle.dataset.color = type.color;
                toggle.style.color = type.color;
                toggle.innerHTML = `
                    <div class="color-preview" style="background-color: ${type.color}"></div>
                    <span class="toggle-text">${type.name}</span>
                `;
                
                toggle.addEventListener('click', function() {
                    this.classList.toggle('selected');
                    if (this.classList.contains('selected')) {
                        selectedActivityTypes.add(type.id);
                        this.style.backgroundColor = type.color;
                        this.style.color = '#ffffff';
                    } else {
                        selectedActivityTypes.delete(type.id);
                        this.style.backgroundColor = 'transparent';
                        this.style.color = type.color;
                    }
                    filterPersonelList();
                });
                
                filterActivityTypeToggles.appendChild(toggle);
            });
        } else {
            console.error('Filtre aktivite türleri alanı bulunamadı!');
        }
    }

    // Filtreleme alanlarını oluştur
    function createFilterToggles() {
        // Kişi türü filtrelerini oluştur
        const personTypeToggles = document.querySelector('.person-type-toggles');
        personTypes.forEach(type => {
            const toggle = document.createElement('div');
            toggle.className = 'filter-toggle';
            toggle.dataset.id = type.id;
            toggle.dataset.color = type.color;
            toggle.style.color = type.color;
            toggle.innerHTML = `
                <div class="color-preview" style="background-color: ${type.color}"></div>
                <span class="toggle-text">${type.name}</span>
            `;
            
            toggle.addEventListener('click', function() {
                this.classList.toggle('selected');
                if (this.classList.contains('selected')) {
                    selectedPersonTypes.add(type.id);
                    this.style.backgroundColor = type.color;
                    this.style.color = '#ffffff';
                } else {
                    selectedPersonTypes.delete(type.id);
                    this.style.backgroundColor = 'transparent';
                    this.style.color = type.color;
                }
                filterPersonelList();
            });
            
            personTypeToggles.appendChild(toggle);
        });

        // Filtre butonuna tıklama olayı
        const filterToggle = document.getElementById('filterToggle');
        const filterPanel = document.getElementById('filterPanel');
        
        filterToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            filterPanel.classList.toggle('active');
        });
    }

    // Personel listesini filtrele
    function filterPersonelList() {
        console.log('Filtreleme başladı');
        const searchTerm = document.getElementById('personelSearch').value.toLowerCase();
        const personelItems = document.querySelectorAll('.personel-item');
        
        console.log('Arama terimi:', searchTerm);
        console.log('Bulunan personel öğeleri:', personelItems.length);
        
        personelItems.forEach(item => {
            const personelId = item.dataset.id;
            const personel = personelData.personeller.find(p => p.id === personelId);
            
            if (!personel) {
                console.warn('Personel bulunamadı:', personelId);
                item.style.display = 'none';
                return;
            }
            
            const personelName = personel.name.toLowerCase();
            const personelTitle = personel.title.toLowerCase();
            
            // Kişi türü filtresi
            const personTypeMatch = selectedPersonTypes.size === 0 || 
                                  selectedPersonTypes.has(personel.typeId);
            
            // Aktivite türü filtresi
            const personelEventIds = eventParticipants
                .filter(p => p.personelId === personelId)
                .map(p => p.eventId);
            
            const personelEvents = events.filter(e => personelEventIds.includes(e.id));
            const personelActivityTypes = new Set(personelEvents.map(e => e.activityTypeId));
            
            const activityTypeMatch = selectedActivityTypes.size === 0 || 
                                    [...selectedActivityTypes].some(typeId => personelActivityTypes.has(typeId));
            
            // Metin araması
            const textMatch = personelName.includes(searchTerm) || personelTitle.includes(searchTerm);
            
            console.log('Personel filtresi sonuçları:', {
                personelId,
                personTypeMatch,
                activityTypeMatch,
                textMatch,
                personelName,
                personelTitle
            });
            
            // Tüm filtreleri uygula
            if (personTypeMatch && activityTypeMatch && textMatch) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Personel arama fonksiyonu
    const searchInput = document.getElementById('personelSearch');
    searchInput.addEventListener('input', filterPersonelList);

    // Personel listesini oluştur
    function createPersonelList() {
        const personelListesi = document.querySelector('.personel-listesi');
        const personelContainer = document.querySelector('.personel-container');
        const selectedPersonelInfo = document.querySelector('.selected-personel-info');
        
        if (!personelListesi || !personelContainer) {
            console.error('Personel listesi veya container elementi bulunamadı!');
            return;
        }
        
        // Personel listesini temizle
        personelListesi.innerHTML = '';

        // Personel sayısına göre görünürlüğü ayarla
        if (personelData.personeller.length <= 1) {
            personelContainer.style.display = 'none';
            if (selectedPersonelInfo) {
                selectedPersonelInfo.style.display = 'block';
            }
        } else {
            personelContainer.style.display = 'block';
            if (selectedPersonelInfo) {
                selectedPersonelInfo.style.display = 'none';
            }
        }

        // Tüm personelleri tek bir listede göster
        personelData.personeller.forEach(personel => {
            const personelItem = document.createElement('div');
            personelItem.className = 'personel-item';
            personelItem.dataset.id = personel.id;
            personelItem.dataset.code = personel.code;
            personelItem.style.display = 'flex'; // Başlangıçta görünür olarak ayarla

            // Personelin tipini bul
            const personType = personTypes.find(type => type.id === personel.typeId) || {
                color: '#666666',
                icon: '❓'
            };
            
            // Personelin katıldığı aktiviteleri bul
            const personelEvents = eventParticipants
                .filter(p => p.personelId === personel.id)
                .map(p => events.find(e => e.id === p.eventId))
                .filter(e => e !== undefined);
            
            // Etkinlik türlerini bul (tekrar etmeyen)
            const uniqueActivityTypes = [...new Set(personelEvents.map(e => e.activityTypeId))];
            
            personelItem.innerHTML = `
                <div class="personel-info">
                    <span class="personel-type-icon" style="color: ${personType.color}">${personType.icon}</span>
                    <div class="personel-details">
                        <div class="personel-name">${personel.name}</div>
                        <div class="personel-title">${personel.title}</div>
                    </div>
                        <div class="activity-indicators">
                            ${uniqueActivityTypes.map(typeId => {
                                const activityType = activityTypes.find(type => type.id === typeId);
                                return activityType ? `
                                    <div class="activity-indicator" 
                                         style="background-color: ${activityType.color}"
                                         title="${activityType.name}">
                                    </div>
                                ` : '';
                            }).join('')}
                    </div>
                </div>
            `;
            
            personelListesi.appendChild(personelItem);
        });

        // Personel seçim olaylarını ekle
        attachPersonelEvents();

        // Eğer tek personel varsa, otomatik olarak seç
        if (personelData.personeller.length === 1) {
            const singlePersonel = personelData.personeller[0];
            selectedPersonelId = singlePersonel.id;
            selectedPersonelCode = singlePersonel.code;
            updateUrlWithPersonelCode(selectedPersonelCode);
            updateCalendarEvents();
        }
    }

    // Personel seçim olaylarını ekle
    function attachPersonelEvents() {
        document.querySelectorAll('.personel-item').forEach(item => {
            item.addEventListener('click', function() {
                document.querySelectorAll('.personel-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                selectedPersonelId = this.dataset.id;
                selectedPersonelCode = this.dataset.code;
                updateUrlWithPersonelCode(selectedPersonelCode);
                updateCalendarEvents();
            });
        });
    }

    // URL'yi güncelle
    function updateUrlWithPersonelCode(code) {
        const url = new URL(window.location.href);
        if (code) {
            url.searchParams.set('code', code);
        } else {
            url.searchParams.delete('code');
        }
        window.history.pushState({}, '', url);
    }

    // Takvim başlatma
    function initCalendar() {
        const calendarEl = document.getElementById('calendar');
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth', // Ay görünümünde başla
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listView'
            },
            views: {
                listView: {
                    type: 'listWeek',
                    buttonText: 'Liste'
                }
            },
            locale: 'tr',
            firstDay: 1, // Pazartesi gününden başla
            selectable: true,
            editable: true,
            droppable: true,
            eventClick: handleEventClick,
            select: handleDateSelect,
            eventDrop: handleEventDrop,
            eventResize: handleEventResize,
            allDaySlot: true,
            slotMinTime: '08:00:00',
            slotMaxTime: '20:00:00',
            height: 'auto',
            eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            },
            dayCellDidMount: function(info) {
                const date = info.date;
                const dayOfWeek = date.getDay();
                const today = new Date();
                
                // Tarihi yerel saat diliminde ISO formatına çevir
                const dateStr = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
                    .toISOString()
                    .split('T')[0];
                
                // Bugünün tarihini kontrol et
                const isToday = date.getDate() === today.getDate() &&
                              date.getMonth() === today.getMonth() &&
                              date.getFullYear() === today.getFullYear();
                
                // Bugünün hücresini işaretle
                if (isToday) {
                    info.el.style.backgroundColor = '#e3f2fd'; // Açık mavi
                    info.el.style.border = '2px solid #2196f3'; // Mavi kenarlık
                    info.el.style.borderRadius = '4px';
                }
                // Hafta sonu günlerini işaretle
                else if (dayOfWeek === 0 || dayOfWeek === 6) {
                    info.el.style.backgroundColor = '#f8f9fa';
                }

                // Resmi tatil kontrolü
                const tatil = holidays.find(t => t.date === dateStr);
                if (tatil) {
                    // Tatil günü arka plan rengi (bugün değilse)
                    if (!isToday) {
                        info.el.style.backgroundColor = tatil.type === 'religious' ? '#ffeeba' : '#fff3cd';
                    }
                    
                    // Tatil bilgisi için div oluştur
                    const tatilDiv = document.createElement('div');
                    tatilDiv.className = 'tatil-bilgisi';
                    tatilDiv.style.cssText = `
                        font-size: 0.8em;
                        color: ${tatil.type === 'religious' ? '#856404' : '#664d03'};
                        padding: 2px;
                        text-align: center;
                        margin-top: 2px;
                        background-color: ${tatil.type === 'religious' ? 'rgba(255, 238, 186, 0.5)' : 'rgba(255, 243, 205, 0.5)'};
                        border-radius: 3px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    `;
                    tatilDiv.textContent = tatil.title;
                    
                    // Tatil bilgisini hücreye ekle
                    const dayNumber = info.el.querySelector('.fc-daygrid-day-number');
                    if (dayNumber) {
                        dayNumber.style.marginBottom = '2px';
                        info.el.insertBefore(tatilDiv, dayNumber.nextSibling);
                    }
                }
            },
            viewDidMount: function(view) {
                // Görünüm değiştiğinde liste görünümünü güncelle
                if (view.type === 'listWeek') {
                    document.getElementById('calendar').style.display = 'none';
                    document.getElementById('listView').style.display = 'block';
                    updateListView('all');
                } else {
                    document.getElementById('calendar').style.display = 'block';
                    document.getElementById('listView').style.display = 'none';
                }
            }
        });
        calendar.render();

        // Liste görünümü filtreleme
        const listViewFilter = document.getElementById('listViewFilter');
        const customDateRange = document.getElementById('customDateRange');
        const startDate = document.getElementById('startDate');
        const endDate = document.getElementById('endDate');

        if (listViewFilter) {
            listViewFilter.addEventListener('change', function() {
                if (this.value === 'custom') {
                    customDateRange.style.display = 'flex';
                    customDateRange.style.gap = '10px';
                } else {
                    customDateRange.style.display = 'none';
                }
                updateListView(this.value);
            });
        }

        if (startDate && endDate) {
            startDate.addEventListener('change', function() {
                if (listViewFilter.value === 'custom') {
                    updateListView('custom');
                }
            });

            endDate.addEventListener('change', function() {
                if (listViewFilter.value === 'custom') {
                    updateListView('custom');
                }
            });
        }
    }

    // Tarih formatını dönüştürme yardımcı fonksiyonu
    function formatDateToYYYYMMDDHHmm(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    // String tarihi Date objesine çevirme yardımcı fonksiyonu
    function parseYYYYMMDDHHmm(dateStr) {
        const [datePart, timePart] = dateStr.split(' ');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        return new Date(year, month - 1, day, hours, minutes);
    }

    // Takvim olaylarını güncelle
    function updateCalendarEvents() {
        if (!calendar) return;

        console.log('Takvim olayları güncelleniyor...');
        console.log('Seçili personel ID:', selectedPersonelId);
        console.log('Mevcut aktiviteler:', events);

        calendar.removeAllEvents();

        let eventsToShow = [];
        if (selectedPersonelId) {
            const personelParticipantEvents = eventParticipants
                .filter(p => p.personelId === selectedPersonelId)
                .map(p => events.find(e => e.id === p.eventId))
                .filter(e => e !== undefined);

            console.log('Personelin katıldığı aktiviteler:', personelParticipantEvents);
            eventsToShow = personelParticipantEvents;
        } else {
            eventsToShow = events;
        }

        const calendarEvents = eventsToShow.map(event => {
            const activityType = activityTypes.find(type => type.id === event.activityTypeId);
            const location = personelData.personeller.find(p => p.id === event.locationId);
            const participants = eventParticipants
                .filter(p => p.eventId === event.id && p.role === 'participant')
                .map(p => personelData.personeller.find(personel => personel.id === p.personelId))
                .filter(p => p !== undefined);

            // String tarihleri Date objesine çevir
            const startDate = parseYYYYMMDDHHmm(event.start);
            const endDate = parseYYYYMMDDHHmm(event.end);

            return {
                id: event.id,
                title: event.title,
                start: startDate,
                end: endDate,
                backgroundColor: activityType ? activityType.color : '#3788d8',
                extendedProps: {
                    description: event.description,
                    activityTypeId: event.activityTypeId,
                    activityTypeName: activityType ? activityType.name : 'Bilinmeyen',
                    location: location,
                    participants: participants
                }
            };
        });

        console.log('Takvime eklenecek aktiviteler:', calendarEvents);
        calendar.addEventSource(calendarEvents);

        const listViewFilter = document.getElementById('listViewFilter');
        if (listViewFilter) {
            updateListView(listViewFilter.value);
        }
    }

    // Form işlemleri
    eventForm.onsubmit = function(e) {
        e.preventDefault();
        const eventId = document.getElementById('eventId').value;
        
        if (selectedPersonels.size === 0) {
            alert('Lütfen en az bir personel seçin!');
            return;
        }

        const selectedTypeToggle = document.querySelector('.activity-type-toggle.selected');
        if (!selectedTypeToggle) {
            alert('Lütfen bir aktivite türü seçin!');
            return;
        }

        const start = document.getElementById('eventStart').value;
        const end = document.getElementById('eventEnd').value;

        // Çakışmaları kontrol et
        const conflicts = checkActivityConflicts(start, end, selectedPersonels, eventId);
        if (conflicts.length > 0) {
            showConflictWarning(conflicts);
            if (!confirm('Seçili kişiler için çakışan aktiviteler var. Yine de kaydetmek istiyor musunuz?')) {
                return;
            }
        }

        const selectedType = activityTypes.find(type => type.id === selectedTypeToggle.dataset.id);
        const locationId = Array.from(selectedPersonels)[0];

        // Tarihleri YYYY-MM-DD HH:mm formatına çevir
        const startDate = new Date(start);
        const endDate = new Date(end);

        const eventData = {
            title: document.getElementById('eventTitle').value,
            start: formatDateToYYYYMMDDHHmm(startDate),
            end: formatDateToYYYYMMDDHHmm(endDate),
            description: document.getElementById('eventDescription').value,
            activityTypeId: selectedType.id,
            locationId: locationId
        };

        if (eventId) {
            const index = events.findIndex(e => e.id === eventId);
            if (index !== -1) {
                events[index] = { ...events[index], ...eventData };
                pendingChanges.updatedEvents.push(events[index]);
            }
        } else {
            const newEventId = Date.now().toString();
            const newEvent = {
                id: newEventId,
                ...eventData
            };
            events.push(newEvent);
            pendingChanges.newEvents.push(newEvent);

            Array.from(selectedPersonels).forEach(personelId => {
                const participant = {
                    eventId: newEventId,
                    personelId: personelId,
                    role: personelId === locationId ? 'location' : 'participant'
                };
                eventParticipants.push(participant);
            });
        }

        updateCalendarEvents();
        closeModal();
        saveChanges();
    }

    // Aktivite tıklama işleyicisi
    function handleEventClick(info) {
        console.log('Aktivite tıklandı:', info.event);
        
        document.getElementById('eventId').value = info.event.id;
        document.getElementById('eventTitle').value = info.event.title;
        document.getElementById('eventDescription').value = info.event.extendedProps.description || '';
        
        // Tarihleri form alanlarına yerleştir
        const startDate = new Date(info.event.start);
        const endDate = new Date(info.event.end);
        
        document.getElementById('eventStart').value = startDate.toISOString().slice(0, 16);
        document.getElementById('eventEnd').value = endDate.toISOString().slice(0, 16);

        const activityTypeToggle = document.querySelector(`.activity-type-toggle[data-id="${info.event.extendedProps.activityTypeId}"]`);
        if (activityTypeToggle) {
            document.querySelectorAll('.activity-type-toggle').forEach(t => t.classList.remove('selected'));
            activityTypeToggle.classList.add('selected');
        }
        
        selectedPersonels.clear();
        const selectedPersonelTags = document.querySelector('.modal-selected-personel-tags');
        if (selectedPersonelTags) {
            selectedPersonelTags.innerHTML = '';
        }
        
        // Personel listesini oluştur
        const personelDropdown = document.querySelector('.modal-personel-dropdown');
        const personelSearch = document.getElementById('modalPersonelSearch');
        
        if (personelDropdown && personelSearch) {
            personelDropdown.innerHTML = '';
            personelData.personeller.forEach(personel => {
                const div = document.createElement('div');
                div.className = 'modal-personel-item';
                div.dataset.id = personel.id;
                div.dataset.code = personel.code;
                div.innerHTML = `
                    <div class="modal-personel-name">${personel.name}</div>
                    <div class="modal-personel-title">${personel.title}</div>
                `;
                
                div.addEventListener('click', function() {
                    const personelId = this.dataset.id;
                    if (selectedPersonels.has(personelId)) {
                        selectedPersonels.delete(personelId);
                        this.classList.remove('selected');
                        removePersonelTag(personelId);
                    } else {
                        selectedPersonels.add(personelId);
                        this.classList.add('selected');
                        addPersonelTag(personel);
                    }
                    checkAndShowConflicts();
                });
                
                personelDropdown.appendChild(div);
            });

            personelSearch.value = '';
            personelSearch.removeEventListener('input', filterModalPersonelList);
            personelSearch.addEventListener('input', filterModalPersonelList);

            personelSearch.addEventListener('focus', function() {
                personelDropdown.classList.add('active');
            });
            document.addEventListener('click', function(e) {
                if (!personelSearch.contains(e.target) && !personelDropdown.contains(e.target)) {
                    personelDropdown.classList.remove('active');
                }
            });
        }

        const participants = eventParticipants.filter(p => p.eventId === info.event.id);
        participants.forEach(participant => {
            const personel = personelData.personeller.find(p => p.id === participant.personelId);
            if (personel) {
                selectedPersonels.add(personel.id);
                addPersonelTag(personel);
                
                const personelItem = document.querySelector(`.modal-personel-item[data-id="${personel.id}"]`);
                if (personelItem) {
                    personelItem.classList.add('selected');
                }
            }
        });

        const deleteBtn = document.getElementById('deleteEvent');
        if (deleteBtn) {
            deleteBtn.style.display = 'block';
        }

        const submitButton = eventForm.querySelector('button[type="submit"]');
        submitButton.textContent = 'Güncelle';

        openModal();
    }

    // Tarih seçme işleyicisi
    function handleDateSelect(info) {
        console.log('Tarih seçildi:', info);
        selectedDate = {
            start: info.start,
            end: info.end,
            startStr: info.startStr,
            endStr: info.endStr
        };
        openNewEventModal();
    }

    function openNewEventModal() {
        console.log('Modal açılıyor...');
        try {
            // Kaydet butonunun metnini "Kaydet" olarak değiştir
            const submitButton = eventForm.querySelector('button[type="submit"]');
            submitButton.textContent = 'Kaydet';

            // Gerekli elementleri kontrol et
            const personelSearch = document.getElementById('modalPersonelSearch');
            const personelDropdown = document.querySelector('.modal-personel-dropdown');
            const selectedPersonelTags = document.querySelector('.modal-selected-personel-tags');
            
            if (!personelSearch || !personelDropdown || !selectedPersonelTags) {
                console.error('Gerekli elementler bulunamadı:', {
                    personelSearch: !!personelSearch,
                    personelDropdown: !!personelDropdown,
                    selectedPersonelTags: !!selectedPersonelTags
                });
                return;
            }

            // Form alanlarını temizle
            document.getElementById('eventId').value = '';
            document.getElementById('eventTitle').value = '';
            document.getElementById('eventDescription').value = '';
            document.getElementById('eventStart').value = '';
            document.getElementById('eventEnd').value = '';

        // Varsa eski uyarıyı kaldır
        const oldWarning = document.querySelector('.conflict-warning');
        if (oldWarning) {
            oldWarning.remove();
        }

            // Seçili tarihi ayarla
            if (selectedDate) {
                console.log('Seçili tarih bilgisi:', selectedDate);
                
                // Tarihleri ISO formatına çevir
                const startDate = new Date(selectedDate.start);
                const endDate = new Date(selectedDate.end);
                
                // Saat bilgisini ekle (varsayılan olarak 09:00 - 10:00)
                startDate.setHours(9, 0, 0, 0);
                endDate.setHours(10, 0, 0, 0);
                
                const startStr = startDate.toISOString().slice(0, 16);
                const endStr = endDate.toISOString().slice(0, 16);
                
                console.log('Oluşturulan tarih değerleri:', { startStr, endStr });
                
                document.getElementById('eventStart').value = startStr;
                document.getElementById('eventEnd').value = endStr;
            }
            
            // Seçili personelleri temizle
            selectedPersonels.clear();
            selectedPersonelTags.innerHTML = '';
            
            // Personel listesini oluştur
            personelDropdown.innerHTML = '';
            personelData.personeller.forEach(personel => {
                const div = document.createElement('div');
                div.className = 'modal-personel-item';
                div.dataset.id = personel.id;
                div.dataset.code = personel.code;
                div.innerHTML = `
                    <div class="modal-personel-name">${personel.name}</div>
                    <div class="modal-personel-title">${personel.title}</div>
                `;
                
                // Personel seçim olayını ekle
                div.addEventListener('click', function() {
                    const personelId = this.dataset.id;
                    if (selectedPersonels.has(personelId)) {
                        selectedPersonels.delete(personelId);
                        this.classList.remove('selected');
                        removePersonelTag(personelId);
                    } else {
                        selectedPersonels.add(personelId);
                        this.classList.add('selected');
                        addPersonelTag(personel);
                    }
                    // Personel seçiminde çakışma kontrolü yap
                    checkAndShowConflicts();
                });
                
                personelDropdown.appendChild(div);
            });

            // URL'den gelen personel kodunu kontrol et
            const initialPersonelCode = getPersonelCodeFromUrl();
            console.log('Yeni aktivite için URL\'den gelen personel kodu:', initialPersonelCode);

            // Eğer URL'den gelen personel kodu varsa, bu personeli seç
            if (initialPersonelCode) {
                const personel = personelData.personeller.find(p => p.code === initialPersonelCode);
                if (personel) {
                    console.log('Yeni aktivite için personel bulundu:', personel);
                    selectedPersonels.add(personel.id);
                    
                    // Personel etiketini ekle
                    addPersonelTag(personel);
                    
                    // Personel dropdown'unda seçili personeli işaretle
                    const personelItem = document.querySelector(`.modal-personel-item[data-id="${personel.id}"]`);
                    if (personelItem) {
                        personelItem.classList.add('selected');
                    }
                }
            }
            // Eğer seçili personel varsa, bu personeli seç
            else if (selectedPersonelId) {
                const personel = personelData.personeller.find(p => p.id === selectedPersonelId);
                if (personel) {
                    console.log('Yeni aktivite için seçili personel:', personel);
                    selectedPersonels.add(selectedPersonelId);
                    
                    // Personel etiketini ekle
                    addPersonelTag(personel);
                    
                    // Personel dropdown'unda seçili personeli işaretle
                    const personelItem = document.querySelector(`.modal-personel-item[data-id="${selectedPersonelId}"]`);
                    if (personelItem) {
                        personelItem.classList.add('selected');
                    }
                }
            }

            // Arama kutusunu sıfırla ve event listener'ları temizle
            personelSearch.value = '';
            
            // Personel arama işlevselliği
            personelSearch.removeEventListener('input', filterModalPersonelList);
            personelSearch.addEventListener('input', filterModalPersonelList);

            // Dropdown göster/gizle
            personelSearch.addEventListener('focus', function() {
                personelDropdown.classList.add('active');
            });
            document.addEventListener('click', function(e) {
                if (!personelSearch.contains(e.target) && !personelDropdown.contains(e.target)) {
                    personelDropdown.classList.remove('active');
                }
            });

            // Modal'ı göster
            openModal();
        } catch (error) {
            console.error('Modal açılırken hata oluştu:', error);
        }
    }

    function handleEventDrop(info) {
        const event = info.event;
        const index = events.findIndex(e => e.id === event.id);
        if (index !== -1) {
            events[index] = {
                ...events[index],
                start: event.start,
                end: event.end
            };
            pendingChanges.updatedEvents.push(events[index]);
            saveChanges();
        }
    }

    function handleEventResize(info) {
        const event = info.event;
        const index = events.findIndex(e => e.id === event.id);
        if (index !== -1) {
            events[index] = {
                ...events[index],
                start: event.start,
                end: event.end
            };
            pendingChanges.updatedEvents.push(events[index]);
            saveChanges();
        }
    }

    // Aktivite çakışmalarını kontrol et
    function checkActivityConflicts(start, end, selectedPersonels, currentEventId = null) {
        console.log('Çakışma kontrolü başladı:', {
            start,
            end,
            selectedPersonels: Array.from(selectedPersonels),
            currentEventId
        });

        const conflicts = [];
        
        // Tarihleri Date objesine çevir
        const newStart = new Date(start);
        const newEnd = new Date(end);
        
        // Tarihlerin geçerli olduğunu kontrol et
        if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
            console.error('Geçersiz tarih formatı:', { start, end });
            return conflicts;
        }
        
        // Bitiş tarihi başlangıç tarihinden önce olamaz
        if (newEnd <= newStart) {
            console.error('Bitiş tarihi başlangıç tarihinden önce olamaz');
            return conflicts;
        }
        
        // Her seçili personel için çakışma kontrolü yap
        selectedPersonels.forEach(personelId => {
            console.log(`Personel ${personelId} için çakışma kontrolü yapılıyor`);
            
            // Önbellekten personelin aktivitelerini al
            const personelEvents = getPersonelEvents(personelId);

            console.log('Personelin aktiviteleri:', personelEvents);
            
            // Personelin aktivitelerini kontrol et
            const personelConflicts = personelEvents.filter(event => {
                // Mevcut aktiviteyi çakışma kontrolünden hariç tut
                if (currentEventId && event.id === currentEventId) {
                    console.log('Mevcut aktivite hariç tutuldu:', event.id);
                    return false;
                }
                
                // Tarih aralıklarının çakışıp çakışmadığını kontrol et
                const eventStart = new Date(event.start);
                const eventEnd = new Date(event.end);
                
                // Tarihlerin geçerli olduğunu kontrol et
                if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) {
                    console.error('Geçersiz tarih formatı:', { event });
                    return false;
                }
                
                // Çakışma durumlarını kontrol et
                const isStartInRange = newStart >= eventStart && newStart < eventEnd;
                const isEndInRange = newEnd > eventStart && newEnd <= eventEnd;
                const isCompletelyOverlapping = newStart <= eventStart && newEnd >= eventEnd;
                
                const hasConflict = isStartInRange || isEndInRange || isCompletelyOverlapping;
                
                if (hasConflict) {
                    console.log('Çakışma bulundu:', {
                        eventId: event.id,
                        eventStart: eventStart,
                        eventEnd: eventEnd,
                        newStart: newStart,
                        newEnd: newEnd
                    });
                }
                
                return hasConflict;
            });
            
            if (personelConflicts.length > 0) {
                console.log(`Personel ${personelId} için ${personelConflicts.length} çakışma bulundu`);
                
                const personel = personelData.personeller.find(p => p.id === personelId);
                if (!personel) {
                    console.error('Personel bulunamadı:', personelId);
                    return;
                }
                
                conflicts.push({
                    personel: personel,
                    conflicts: personelConflicts.map(event => {
                        const activityType = activityTypes.find(type => type.id === event.activityTypeId);
                        if (!activityType) {
                            console.error('Aktivite türü bulunamadı:', event.activityTypeId);
                        }
                        
                        return {
                        title: event.title,
                        start: new Date(event.start),
                        end: new Date(event.end),
                            activityType: activityType || { color: '#666666', name: 'Bilinmeyen Tür' }
                        };
                    })
                });
            }
        });
        
        console.log('Çakışma kontrolü sonuçları:', conflicts);
        return conflicts;
    }

    // Çakışma uyarısını göster
    function showConflictWarning(conflicts) {
        const warningContainer = document.createElement('div');
        warningContainer.className = 'conflict-warning';
        
        let warningHTML = '<h4>⚠️ Çakışan Aktiviteler</h4>';
        warningHTML += '<p>Aşağıdaki kişilerin seçili tarihte başka aktiviteleri bulunmaktadır:</p>';
        
        conflicts.forEach(conflict => {
            const personType = personTypes.find(type => type.id === conflict.personel.typeId);
            if (!personType) {
                console.error('Kişi türü bulunamadı:', conflict.personel.typeId);
                return;
            }
            
            warningHTML += `
                <div class="conflict-person">
                    <div class="conflict-person-header">
                        <span class="conflict-person-icon" style="color: ${personType.color}">
                            ${personType.icon}
                        </span>
                        <span class="conflict-person-name">${conflict.personel.name}</span>
                        <span class="conflict-person-title">${conflict.personel.title}</span>
                    </div>
                    <div class="conflict-activities">
                        ${conflict.conflicts.map(event => `
                            <div class="conflict-activity">
                                <div class="conflict-activity-color" style="background-color: ${event.activityType.color}"></div>
                                <div class="conflict-activity-details">
                                    <div class="conflict-activity-title">${event.title}</div>
                                    <div class="conflict-activity-time">
                                        ${event.start.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})} - 
                                        ${event.end.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                    <div class="conflict-activity-type" style="color: ${event.activityType.color}">
                                        ${event.activityType.name}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        
        warningContainer.innerHTML = warningHTML;
        
        // Varsa eski uyarıyı kaldır
        const oldWarning = document.querySelector('.conflict-warning');
        if (oldWarning) {
            oldWarning.remove();
        }
        
        // Yeni uyarıyı ekle
        const formGroup = document.querySelector('.form-group:has(#eventStart)');
        formGroup.after(warningContainer);
    }

    // Kaydet butonu için click event listener
    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', async function() {
            try {
                // Değişiklikleri API'ye gönder
                const response = await fetch('/api/events', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        project_name: currentProjectName,
                        newEvents: pendingChanges.newEvents,
                        updatedEvents: pendingChanges.updatedEvents,
                        deletedEvents: pendingChanges.deletedEvents
                    })
                });

                if (!response.ok) {
                    throw new Error('Değişiklikler kaydedilemedi');
                }

                // Başarılı kayıt sonrası
                hasUnsavedChanges = false;
                pendingChanges = {
                    newEvents: [],
                    updatedEvents: [],
                    deletedEvents: []
                };
                saveChangesBtn.style.display = 'none';
                
                // Başarı mesajı göster
                showSuccessMessage('Değişiklikler başarıyla kaydedildi');
                
            } catch (error) {
                console.error('Kaydetme hatası:', error);
                showErrorMessage('Değişiklikler kaydedilirken bir hata oluştu');
            }
        });
    }

    // Başarı mesajı göster
    function showSuccessMessage(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.innerHTML = `
            <div class="success-content">
                <span class="success-icon">✅</span>
                <span class="success-text">${message}</span>
                <button class="success-close">&times;</button>
            </div>
        `;
        
        document.body.appendChild(successDiv);
        
        // Kapatma butonuna tıklama olayı ekle
        successDiv.querySelector('.success-close').addEventListener('click', () => {
            successDiv.remove();
        });
        
        // 3 saniye sonra otomatik kapat
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }

    // Değişiklikleri kaydet
    function saveChanges() {
        hasUnsavedChanges = true;
        saveChangesBtn.style.display = 'inline-block';
    }

    // Event array işlemleri
    function addEventToArray(eventData) {
        const newEvent = {
            id: Date.now().toString() + '_' + eventData.personelId,
            ...eventData
        };
        events.push(newEvent);
    }

    function updateEventInArray(eventId, eventData) {
        const index = events.findIndex(e => e.id === eventId);
        if (index !== -1) {
            events[index] = { ...events[index], ...eventData };
        }
    }

    function deleteEventFromArray(eventId) {
        events = events.filter(e => e.id !== eventId);
    }

    function updateEvent(event) {
        const index = events.findIndex(e => e.id === event.id);
        if (index !== -1) {
            // Mevcut aktivitenin katılımcılarını al
            const currentParticipants = eventParticipants.filter(p => p.eventId === event.id);
            const selectedPersonels = new Set(currentParticipants.map(p => p.personelId));
            
            // Çakışma kontrolü yap
            const conflicts = checkActivityConflicts(
                event.start.toISOString().slice(0, 16),
                event.end.toISOString().slice(0, 16),
                selectedPersonels,
                event.id
            );
            
            if (conflicts.length > 0) {
                showConflictWarning(conflicts);
                if (!confirm('Seçili kişiler için çakışan aktiviteler var. Yine de güncellemek istiyor musunuz?')) {
                    // Kullanıcı iptal ederse, aktiviteyi eski haline getir
                    calendar.getEventById(event.id).revert();
                    return;
                }
            }
            
            // Çakışma yoksa veya kullanıcı onayladıysa güncelle
            events[index] = {
                ...events[index],
                start: event.start,
                end: event.end
            };
            
            // Varsa eski uyarıyı kaldır
            const oldWarning = document.querySelector('.conflict-warning');
            if (oldWarning) {
                oldWarning.remove();
            }
        }
    }

    // Rastgele renk oluşturma fonksiyonu
    function getRandomColor() {
        const colors = [
            '#3788d8', // mavi
            '#28a745', // yeşil
            '#dc3545', // kırmızı
            '#ffc107', // sarı
            '#17a2b8', // turkuaz
            '#6f42c1'  // mor
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // Tarih değişikliklerini dinle
    document.getElementById('eventStart').addEventListener('change', function() {
        const start = this.value;
        const end = document.getElementById('eventEnd').value;
        const eventId = document.getElementById('eventId').value;
        if (start && end && selectedPersonels.size > 0) {
            const conflicts = checkActivityConflicts(start, end, selectedPersonels, eventId);
            if (conflicts.length > 0) {
                showConflictWarning(conflicts);
            } else {
                const oldWarning = document.querySelector('.conflict-warning');
                if (oldWarning) {
                    oldWarning.remove();
                }
            }
        }
    });

    document.getElementById('eventEnd').addEventListener('change', function() {
        const start = document.getElementById('eventStart').value;
        const end = this.value;
        const eventId = document.getElementById('eventId').value;
        if (start && end && selectedPersonels.size > 0) {
            const conflicts = checkActivityConflicts(start, end, selectedPersonels, eventId);
            if (conflicts.length > 0) {
                showConflictWarning(conflicts);
            } else {
                const oldWarning = document.querySelector('.conflict-warning');
                if (oldWarning) {
                    oldWarning.remove();
                }
            }
        }
    });

    // Personel arama fonksiyonu (modal için)
    function filterModalPersonelList() {
        const personelSearch = document.getElementById('modalPersonelSearch');
        const personelDropdown = document.querySelector('.modal-personel-dropdown');
        const searchTerm = personelSearch.value.toLowerCase();
        const items = personelDropdown.querySelectorAll('.modal-personel-item');
        items.forEach(item => {
            const name = item.querySelector('.modal-personel-name').textContent.toLowerCase();
            const title = item.querySelector('.modal-personel-title').textContent.toLowerCase();
            if (name.includes(searchTerm) || title.includes(searchTerm)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Çakışma kontrolü ve uyarı gösterme
    function checkAndShowConflicts() {
        const start = document.getElementById('eventStart').value;
        const end = document.getElementById('eventEnd').value;
        const eventId = document.getElementById('eventId').value;
        
        if (start && end && selectedPersonels.size > 0) {
            const conflicts = checkActivityConflicts(start, end, selectedPersonels, eventId);
            if (conflicts.length > 0) {
                showConflictWarning(conflicts);
            } else {
                // Varsa eski uyarıyı kaldır
                const oldWarning = document.querySelector('.conflict-warning');
                if (oldWarning) {
                    oldWarning.remove();
                }
            }
        }
    }

    // Personel etiketi ekle
    function addPersonelTag(personel) {
        const selectedPersonelTags = document.querySelector('.modal-selected-personel-tags');
        if (!selectedPersonelTags) {
            console.error('Seçili personel etiketleri alanı bulunamadı!');
            return;
        }

        // Eğer etiket zaten varsa ekleme
        if (selectedPersonelTags.querySelector(`[data-id="${personel.id}"]`)) {
            return;
        }

        const personType = personTypes.find(type => type.id === personel.typeId) || {
            color: '#666666',
            icon: '❓'
        };

        const tag = document.createElement('div');
        tag.className = 'selected-personel-tag';
        tag.dataset.id = personel.id;
        tag.innerHTML = `
            <span class="personel-type-icon" style="color: ${personType.color}">${personType.icon}</span>
            <span class="personel-name">${personel.name}</span>
            <button class="remove-tag">&times;</button>
        `;

        // Kaldırma butonuna tıklama olayı ekle
        tag.querySelector('.remove-tag').addEventListener('click', function() {
            selectedPersonels.delete(personel.id);
            tag.remove();
            
            // Personel dropdown'undan seçimi kaldır
            const personelItem = document.querySelector(`.modal-personel-item[data-id="${personel.id}"]`);
            if (personelItem) {
                personelItem.classList.remove('selected');
            }
            
            // Çakışma kontrolü yap
            checkAndShowConflicts();
        });

        selectedPersonelTags.appendChild(tag);
    }

    // Personel etiketini kaldır
    function removePersonelTag(personelId) {
        const tag = document.querySelector(`.selected-personel-tag[data-id="${personelId}"]`);
        if (tag) {
            tag.remove();
        }
    }

    // Takvim olaylarını güncelle
    function updateCalendarEvents() {
        if (!calendar) return;

        console.log('Takvim olayları güncelleniyor...');
        console.log('Seçili personel ID:', selectedPersonelId);
        console.log('Mevcut aktiviteler:', events);

        calendar.removeAllEvents();

        let eventsToShow = [];
        if (selectedPersonelId) {
            const personelParticipantEvents = eventParticipants
                .filter(p => p.personelId === selectedPersonelId)
                .map(p => events.find(e => e.id === p.eventId))
                .filter(e => e !== undefined);

            console.log('Personelin katıldığı aktiviteler:', personelParticipantEvents);
            eventsToShow = personelParticipantEvents;
        } else {
            eventsToShow = events;
        }

        const calendarEvents = eventsToShow.map(event => {
            const activityType = activityTypes.find(type => type.id === event.activityTypeId);
            const location = personelData.personeller.find(p => p.id === event.locationId);
            const participants = eventParticipants
                .filter(p => p.eventId === event.id && p.role === 'participant')
                .map(p => personelData.personeller.find(personel => personel.id === p.personelId))
                .filter(p => p !== undefined);

            // String tarihleri Date objesine çevir
            const startDate = parseYYYYMMDDHHmm(event.start);
            const endDate = parseYYYYMMDDHHmm(event.end);

            return {
                id: event.id,
                title: event.title,
                start: startDate,
                end: endDate,
                backgroundColor: activityType ? activityType.color : '#3788d8',
                extendedProps: {
                    description: event.description,
                    activityTypeId: event.activityTypeId,
                    activityTypeName: activityType ? activityType.name : 'Bilinmeyen',
                    location: location,
                    participants: participants
                }
            };
        });

        console.log('Takvime eklenecek aktiviteler:', calendarEvents);
        calendar.addEventSource(calendarEvents);

        const listViewFilter = document.getElementById('listViewFilter');
        if (listViewFilter) {
            updateListView(listViewFilter.value);
        }
    }

    // Liste görünümünü güncelle
    function updateListView(filter) {
        const listViewContent = document.querySelector('.list-view-content');
        if (!listViewContent) {
            console.error('Liste görünümü içeriği bulunamadı!');
            return;
        }

        console.log('Liste görünümü güncelleniyor...');
        console.log('Mevcut aktiviteler:', events);

        let filteredEvents = [...events];

        // Filtreleme
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        console.log('Filtre:', filter);
        console.log('Seçili personel ID:', selectedPersonelId);

        switch (filter) {
            case 'today':
                filteredEvents = events.filter(event => {
                    const eventDate = new Date(event.start);
                    return eventDate.toDateString() === today.toDateString();
                });
                break;
            case 'week':
                filteredEvents = events.filter(event => {
                    const eventDate = new Date(event.start);
                    return eventDate >= weekStart && eventDate < new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
                });
                break;
            case 'month':
                filteredEvents = events.filter(event => {
                    const eventDate = new Date(event.start);
                    return eventDate >= monthStart && eventDate < new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
                });
                break;
            case 'custom':
                const startDate = document.getElementById('startDate').value;
                const endDate = document.getElementById('endDate').value;
                if (startDate && endDate) {
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999); // Günün sonuna ayarla
                    filteredEvents = events.filter(event => {
                        const eventDate = new Date(event.start);
                        return eventDate >= start && eventDate <= end;
                    });
                }
                break;
        }

        console.log('Filtreleme sonrası aktiviteler:', filteredEvents);

        // Seçili personel varsa filtrele
        if (selectedPersonelId) {
            const participantEvents = eventParticipants
                .filter(p => p.personelId === selectedPersonelId)
                .map(p => p.eventId);
            filteredEvents = filteredEvents.filter(event => participantEvents.includes(event.id));
            console.log('Personel filtresi sonrası aktiviteler:', filteredEvents);
        }

        // Tarihe göre sırala
        filteredEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

        // Listeyi oluştur
        if (filteredEvents.length === 0) {
            listViewContent.innerHTML = '<div class="no-events">Gösterilecek aktivite bulunmamaktadır.</div>';
            return;
        }

        const listHTML = filteredEvents.map(event => {
            const activityType = activityTypes.find(type => type.id === event.activityTypeId);
            const location = personelData.personeller.find(p => p.id === event.locationId);
            const participants = eventParticipants
                .filter(p => p.eventId === event.id && p.role === 'participant')
                .map(p => personelData.personeller.find(personel => personel.id === p.personelId))
                .filter(p => p !== undefined);

            // Eksik veri kontrolü
            if (!activityType) {
                console.warn(`Aktivite türü bulunamadı: ${event.activityTypeId}`);
                return '';
            }

            if (!location) {
                console.warn(`Lokasyon bulunamadı: ${event.locationId}`);
                return '';
            }

            const locationType = personTypes.find(type => type.id === location.typeId) || {
                color: '#666666',
                icon: '❓'
            };

            const participantCount = participants.length;
            const participantText = participantCount > 0 ? ` (+${participantCount} kişi)` : '';

            return `
                <div class="activity-list-item" data-id="${event.id}">
                    <div class="activity-time">
                        ${new Date(event.start).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})} - 
                        ${new Date(event.end).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}
                    </div>
                    <div class="activity-title">${event.title}</div>
                    <div class="activity-type" style="color: ${activityType.color}">
                        <span class="color-dot" style="background-color: ${activityType.color}"></span>
                        ${activityType.name}
                    </div>
                    <div class="activity-location">
                        <span class="location-icon" style="color: ${locationType.color}">${locationType.icon}</span>
                        ${location.name}${participantText}
                    </div>
                </div>
            `;
        }).filter(html => html !== '').join('');

        console.log('Oluşturulan HTML:', listHTML);
        listViewContent.innerHTML = listHTML;

        // Liste öğelerine tıklama olayı ekle
        document.querySelectorAll('.activity-list-item').forEach(item => {
            item.addEventListener('click', function() {
                const eventId = this.dataset.id;
                const event = events.find(e => e.id === eventId);
                if (event) {
                    const calendarEvent = calendar.getEventById(eventId);
                    if (calendarEvent) {
                        handleEventClick({ event: calendarEvent });
                    }
                }
            });
        });
    }

    // Modal açma fonksiyonu
    function openModal() {
        modal.style.display = "block";
        modalBackdrop.classList.add('active');
        document.body.style.overflow = 'hidden'; // Sayfa kaydırmayı engelle
    }

    // Modal kapatma fonksiyonu
    function closeModal() {
        modal.style.display = "none";
        modalBackdrop.classList.remove('active');
        document.body.style.overflow = ''; // Sayfa kaydırmayı geri aç
        // Form alanlarını temizle
        eventForm.reset();
        // Seçili personelleri temizle
        selectedPersonels.clear();
        const selectedPersonelTags = document.querySelector('.modal-selected-personel-tags');
        if (selectedPersonelTags) {
            selectedPersonelTags.innerHTML = '';
        }
        // Varsa eski uyarıyı kaldır
        const oldWarning = document.querySelector('.conflict-warning');
        if (oldWarning) {
            oldWarning.remove();
        }
    }

    // Modal kapatma işlemleri
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    // Modal dışına tıklama ile kapatma
    modal.addEventListener('click', function(e) {
        // Eğer tıklanan element modal içeriği değilse modalı kapat
        if (e.target === modal) {
            closeModal();
        }
    });

    // ESC tuşu ile kapatma
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal && modal.style.display === "block") {
            closeModal();
        }
    });

    // Verileri yükle
    loadData();
}); 