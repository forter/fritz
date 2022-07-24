// vim: filetype=groovy

node('general') {
    base = load '/var/jenkins_home/workspace/Infra/build-scripts/build/Jenkinsfile'
    base.execute([
        credentials      : base.get_decrypt_creds(),
        distImages       : ['events-forwarder'],
        masterBranch     : 'main',
        alertSlackChannel: 'precision-engineering-oncall',
    ])
}
