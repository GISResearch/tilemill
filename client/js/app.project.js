var ProjectListView = Backbone.View.extend({
    id: 'ProjectListView',
    initialize: function() {
        _.bindAll(this, 'render', 'add');
        this.collection.bind('add', this.render);
        this.collection.bind('remove', this.render);
        this.collection.fetch({
            success: this.render,
            error: this.render
        });
    },
    render: function() {
        // Render the projects wrapper if not present.
        if ($(this.el).has('ul.projects').length === 0) {
            $(this.el).html(ich.ProjectListView());
            window.app.el.html(this.el);
        }

        // Add a row view for each project. Note that we use a pointer as the
        // projects are added to ensure that when new projects are added on a
        // re-render they are placed at the correct index in the list.
        var that = this;
        var pointer = null;
        this.collection.each(function(project) {
            if (!project.view) {
                project.view = new ProjectRowView({
                    model: project,
                    collection: this.collection
                });
                if (!pointer) {
                    $('ul.projects', self.el).prepend(project.view.el);
                }
                else {
                    $(pointer).after(project.view.el);
                }
            }
            pointer = project.view.el;
        });
        return this;
    },
    events: {
        'click input.submit': 'add',
        'click div#header a.info': 'about',
        'click div#header a.settings': 'settings'
    },
    add: function() {
        var id = $('input.text', this.el).val();
        if (this.collection.get(id)) {
            window.app.message('Error', 'Project names must be unique.');
            $('input.text', this.el).val('');
            return false;
        }
        window.app.loading();
        var that = this;
        var project = new Project;
        var success = project.set(
            { id: id },
            { error: this.showError }
        );
        if (success) {
            project.setDefaults();
            project.save(project, {
                success: function() {
                    $('input.text', this.el).val('');
                    that.collection.add(project);
                    window.app.done();
                },
                error: this.showError
            });
        }
        return false;
    },
    showError: function(model, error) {
        window.app.done();
        window.app.message('Error', error);
    },
    settings: function() {
        new SettingsPopupView({ model: window.app.settings });
        return false;
    }
});

var ProjectRowView = Backbone.View.extend({
    tagName: 'li',
    className: 'clearfix',
    initialize: function() {
        _.bindAll(this, 'render', 'del');
        this.render();
    },
    // See http://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#lon.2Flat_to_tile_numbers_2
    thumb: function() {
        var center = this.model.get('_center');
        center.lat = -1 * center.lat; // TMS is flipped from OSM calc below.
        var z = center.zoom;
        var lat_rad = center.lat * Math.PI / 180;
        var x = parseInt((center.lon + 180.0) / 360.0 * Math.pow(2,z));
        var y = parseInt((1.0 - Math.log(Math.tan(lat_rad) + (1 / Math.cos(lat_rad))) / Math.PI) / 2.0 * Math.pow(2,z));
        return this.model.layerURL() + ['1.0.0', this.model.project64({signed: true}), z, x, y].join('/') + '.png';
    },
    render: function() {
        $(this.el).html(ich.ProjectRowView({
            id: this.model.get('id'),
            thumb: this.thumb()
        }));
        return this;
    },
    events: {
        'click .delete': 'del'
    },
    del: function() {
        var that = this;
        window.app.loading();
        if (confirm('Are you sure you want to delete this project?')) {
            this.model.destroy({
                success: function() {
                    that.remove();
                    window.app.done();
                },
                error: function() {
                    window.app.done();
                    window.app.message('Error', 'The project could not be deleted.');
                }
            });
        }
        else {
            window.app.done();
        }
        return false;
    }
});

var ProjectView = Backbone.View.extend({
    id: 'ProjectView',
    events: {
        'click #header a.save': 'saveProject',
        'click #header a.settings': 'settings',
        'click #header a.close': 'close',
        'click #tabs a.reference': 'reference',
        'click div#header a.options': 'projectOptions'
    },
    initialize: function() {
        _.bindAll(this, 'render', 'saveProject',
            'home', 'minimal', 'changed', 'reference', 'setMinimal');
        window.app.settings.bind('change', this.setMinimal);
        this.model.view = this;
        this.model.bind('change', this.changed);
        this.model.fetch({
            success: this.render,
            error: function(err, data) {
                var obj = $.parseJSON(data.responseText);
                window.app.message('Error', obj.message, 'error', function() {
                    window.location = '/';
                });
            }
        });
    },
    render: function() {
        $(this.el).html(ich.ProjectView(this.model));

        var layers = new LayerListView({
                collection: this.model.get('Layer'),
                project: this.model
            }),
            stylesheets = new StylesheetListView({
                collection: this.model.get('Stylesheet'),
                project: this.model
            }),
            tools = new StylesheetTools({
                project: this.model
            }),
            map = new MapView({
                model: this.model
            }),
            exportDropdown = new ExportDropdownView({
                collection: new ExportList(),
                abilities: window.app.abilities,
                project: this.model,
                map: map
            });

        $('#sidebar', this.el).append(map.el);
        $('#sidebar', this.el).append(layers.el);
        $('#sidebar', this.el).append(tools.el);
        $('#main', this.el).append(stylesheets.el);
        $('#header .actions a.save', this.el).after(exportDropdown.el);

        window.app.el.html(this.el);
        window.app.trigger('ready');
        this.setMinimal(); // set minimal/normal mode
        return this;
    },
    saveProject: function() {
        var that = this;

        // Clear out validation error markers. They will be re-drawn if this
        // save event encounters further errors.
        $('.CodeMirror-line-numbers div')
            .removeClass('syntax-error')
            .attr('title', '')
            .unbind('mouseenter mouseleave'); // Removes tipsy.
        $('a.tab.hasError', self.el).removeClass('hasError')
        $('.tipsy').remove();

        this.model.save(this.model, {
            success: function() {
                that.model.trigger('save');
                $('#header a.save', self.el).removeClass('changed').addClass('disabled').html('Saved');
            },
            error: function(err, data) {
                if (typeof data === 'string') {
                    window.app.message('Error', data);
                } else if (data.status == 500) {
                    var err_obj = $.parseJSON(data.responseText);
                    if (_.isArray(err_obj)) {
                        _.each(err_obj, function(error) {
                            if (error.line) {
                                var editor = _.detect(
                                    that.model.view.stylesheets.collection.models,
                                    function(s) {
                                        return s.id == error.filename;
                                });
                                $('div.CodeMirror-line-numbers div:nth-child('
                                    + error.line
                                    + ')',
                                    editor.view.codemirror.lineNumbers)
                                    .addClass('syntax-error')
                                    .attr('title', error.message)
                                    .tipsy({gravity: 'w'});
                                $(editor.view.el).addClass('hasError');
                            } else {
                                window.app.message('Error', error.message);
                            }
                        });
                    } else {
                        window.app.message('Error', err_obj.message);
                    }
                }
            }
        });
        return false;
    },
    close: function() {
        if (!$('#header a.save', this.el).is('.changed') || confirm('You have unsaved changes. Are you sure you want to close this project?')) {
            this.watcher && this.watcher.destroy();
            return true;
        }
        return false;
    },
    reference: function() {
        if (this.referenceView) {
            this.referenceView.remove();
            delete this.referenceView;
        }
        else {
            this.referenceView = new ReferenceView();
        }
        return false;
    },
    setMinimal: function() {
        var that = this;
        if (window.app.settings.get('mode') === 'minimal') {
            $('body').addClass('minimal');
            this.watcher = new Watcher(this.model, function() {
                that.model.trigger('save');
            });
        }
        else if (this.watcher) {
            $('body').removeClass('minimal');
            this.watcher.destroy();
        }
        return false;
    },
    changed: function() {
        $('#header a.save', this.el).removeClass('disabled').addClass('changed').html('Save');
    },
    settings: function() {
        new SettingsPopupView({ model: window.app.settings });
        return false;
    },
    projectOptions: function() {
        new ProjectPopupView({ model: this.model });
        return false;
    }
});

var ProjectPopupView = PopupView.extend({
    events: _.extend({
        'click input.submit': 'submit'
    }, PopupView.prototype.events),
    initialize: function(options) {
        _.bindAll(this, 'submit');
        this.options.title = 'Project options';
        this.options.content = ich.ProjectPopupView({
            'format_png': this.model.get('_format') === 'png',
            'format_png8': this.model.get('_format') === 'png8',
            'format_jpeg80': this.model.get('_format') === 'jpeg80',
            'format_jpeg85': this.model.get('_format') === 'jpeg85',
            'format_jpeg90': this.model.get('_format') === 'jpeg90',
            'format_jpeg95': this.model.get('_format') === 'jpeg95'
        }, true);
        PopupView.prototype.initialize.call(this, options);
    },
    submit: function() {
        var success = this.model.set(
            { '_format': $('select#format', this.el).val() },
            { 'error': this.showError }
        );
        if (success) {
            this.model.view.saveProject();
            this.remove();
        }
        return false;
    },
    showError: function(model, error) {
        window.app.message('Error', error);
    }
});

