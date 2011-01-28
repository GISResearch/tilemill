/**
 * View: MapView
 *
 * The map preview for a project.
 */
var MapView = Backbone.View.extend({
    id: 'MapView',
    initialize: function() {
        _.bindAll(this, 'render', 'activate', 'controlZoom', 'reload',
            'fullscreen', 'minimize', 'maximize');
        this.render();
        this.model.bind('save', this.reload);
        window.app.bind('ready', this.activate);
    },
    events: {
        'click a.map-fullscreen': 'fullscreen'
    },
    render: function() {
        $(this.el).html(ich.MapView({ id: this.model.id }));
    },
    activate: function() {
        var options = {
            projection: new OpenLayers.Projection('EPSG:900913'),
            displayProjection: new OpenLayers.Projection('EPSG:4326'),
            units: 'm',
            numZoomLevels: 23,
            maxResolution: 156543.0339,
            maxExtent: new OpenLayers.Bounds(
                -20037500,
                -20037500,
                20037500,
                20037500
            ),
            controls: []
        };

        // Retrieve stored centerpoint from model and convert to map units.
        var center = this.model.get('_center');
        var lonlat = new OpenLayers.LonLat(center.lon, center.lat)
        lonlat.transform(
            new OpenLayers.Projection('EPSG:4326'),
            new OpenLayers.Projection('EPSG:900913')
        );
        center.lat = lonlat.lat;
        center.lon = lonlat.lon;

        // Nav control images.
        // @TODO: Store locally so the application is portable/usable offline?
        OpenLayers.ImgPath = 'images/openlayers_dark/';

        this.map = new OpenLayers.Map('map-preview-' + this.model.id, options);
        this.layer = new OpenLayers.Layer.TMS('Preview', this.model.layerURL(), {
            layername: this.model.project64({signed: true}),
            type: this.model.get('_format'),
            buffer: 0,
            transitionEffect: 'resize',
            wrapDateLine: true
        });
        this.map.addLayers([this.layer]);

        // Set the map's initial center point
        this.map.setCenter(new OpenLayers.LonLat(center.lon, center.lat), center.zoom);

        // Add custom controls
        var navigation = new OpenLayers.Control.Navigation({ zoomWheelEnabled: true });
        this.map.addControl(navigation);
        navigation.activate();

        this.controlZoom({element: this.map.div});
        this.map.events.register('moveend', this.map, this.controlZoom);
        this.map.events.register('zoomend', this.map, this.controlZoom);

        // Stop event propagation to the OL map.
        $('#zoom-display div, a.map-fullscreen').mousedown(function(e) {
            e.stopPropagation();
        });
        $('#zoom-display div, a.map-fullscreen').mouseup(function(e) {
            e.stopPropagation();
        });
        $('#zoom-display .zoom-in').click($.proxy(function(e) {
            e.stopPropagation();
            this.map.zoomIn();
        }, this));
        $('#zoom-display .zoom-out').click($.proxy(function(e) {
            e.stopPropagation();
            this.map.zoomOut();
        }, this));

        return this;
    },

    fullscreen: function() {
        $(this.el).toggleClass('fullscreen');
        this.map.updateSize();
        return false;
    },

    maximize: function() {
        $(this.el).addClass('fullscreen');
        this.map.updateSize();
        return false;
    },

    minimize: function() {
        $(this.el).removeClass('fullscreen');
        this.map.updateSize();
        return false;
    },

    controlZoom: function(e) {
        // Set the model center whenever the map is moved.
        // Retrieve centerpoint from map and convert to lonlat units.
        var center = this.map.getCenter();
        var zoom = this.map.getZoom();
        var lonlat = new OpenLayers.LonLat(center.lon, center.lat);
        lonlat.transform(
            this.map.projection,
            new OpenLayers.Projection("EPSG:4326")
        );
        center = { lat: lonlat.lat, lon: lonlat.lon, zoom: zoom };
        this.model.set({ _center: center }, { silent: true });

        (e.element.id && $('#zoom-display h4', e.element).size()) &&
            $('#zoom-display h4', e.element)
                .text('Zoom level ' + this.map.getZoom());
    },

    reload: function() {
        if (this.map.layers && this.map.layers && this.map.layers[0]) {
            this.map.layers[0].type = this.model.get('_format');
            this.map.layers[0].layername = this.model.project64({signed: true});
            this.map.layers[0].redraw();
        }
    }
});

